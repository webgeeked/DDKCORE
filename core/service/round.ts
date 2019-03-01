import Response from 'shared/model/response';
import crypto from 'crypto';
import SlotService from 'core/service/slot';
import Config from 'shared/util/config';
// todo delete it when find a way to mock services for tests
// import BlockService from 'test/core/mock/blockService';
// import { createTaskON } from 'test/core/mock/bus';
// import BlockRepository from 'test/core/mock/blockRepository';
import BlockService from 'core/service/block';
import BlockRepository from 'core/repository/block';
import { Slots, Round } from 'shared/model/round';
import RoundRepository from 'core/repository/round';
import { createTaskON } from 'shared/util/bus';
import DelegateRepository from 'core/repository/delegate';
import AccountRepository from 'core/repository/account';
import { ed } from 'shared/util/ed';
import { Delegate } from 'shared/model/delegate';
import { logger } from 'shared/util/logger';
import { compose } from 'core/util/common';

const constants = Config.constants;

interface IHashList {
    hash: string;
    generatorPublicKey: string;
}

interface IRoundSum {
    roundFees: number;
    roundDelegates: Array<string>;
}

interface IRoundService {

    generateHashList(params: {activeDelegates: Array<Delegate>, blockId: string}):
        Array<{hash: string, generatorPublicKey: string}>;

    sortHashList(hashList: Array<{hash: string, generatorPublicKey: string}>):
        Array<{hash: string, generatorPublicKey: string}>;

    generatorPublicKeyToSlot(sortedHashList: Array<{hash: string, generatorPublicKey: string}>): Slots;

    generateRound(): Response<void>;

    getMyTurn(): number;

    sumRound(round): Promise<Response<IRoundSum>>;

    rebuild(): void;

    rollBack(): void;

    validate(): boolean;

    applyUnconfirmed(param: Promise<Response<IRoundSum>>): Promise<Response<void>>;

    undoUnconfirmed(round: Round): Promise<Response<string>>;

    apply(params: Promise<Response<Array<string>>>): void;

    undo(params: Promise<Response<Array<string>>>): boolean;

    calcRound(height: number): number;

}

class RoundService implements IRoundService {
    private keypair: {
        privateKey: string,
        publicKey: string,
    };

    constructor() {
        const hash = crypto.createHash('sha256').update(process.env.FORGE_SECRET, 'utf8').digest();
        const keypair = ed.makeKeypair(hash);

        this.keypair = {
            privateKey: keypair.privateKey.toString('hex'),
            publicKey: keypair.publicKey.toString('hex'),
        };
    }

    public generateHashList(params: { activeDelegates: Array<Delegate>, blockId: string }): Array<IHashList> {
        return params.activeDelegates.map((delegate: Delegate) => {
            const publicKey = delegate.account.publicKey;
            const hash = crypto.createHash('md5').update(publicKey + params.blockId).digest('hex');
            return {
                hash,
                generatorPublicKey: publicKey
            };
        });
    }

    public sortHashList(hashList: Array<IHashList>): Array<IHashList> {
        return hashList.sort((a, b) => {
            if (a.hash > b.hash) {
                return 1;
            }
            if (a.hash < b.hash) {
                return -1;
            }
            return 0;
        });
    }

    public generatorPublicKeyToSlot(sortedHashList: Array<IHashList>): Slots {
        let firstSlot = SlotService.getSlotNumber();
        // set the last round slot

        return sortedHashList.reduce(
            (acc: Object = {}, item: IHashList, i) => {
            acc[item.generatorPublicKey] = { slot: firstSlot + i };
            return acc;
        }, {});
    }

    public generateRound(): Response<void> {
        /**
         * if triggered by ROUND_FINISH event
         */
        if (
            RoundRepository.getCurrentRound()
        ) {
            compose(
                this.applyUnconfirmed,
                this.sumRound
            )(RoundRepository.getCurrentRound());

            // store pound as previous
            RoundRepository.setPrevRound(RoundRepository.getCurrentRound());
        }

        const lastBlock = BlockService.getLastBlock();
        const delegateResponse = DelegateRepository.getActiveDelegates();

        if (!delegateResponse.success) {
            logger.error('[RoundService][generateRound] Can\'t get Active delegates');
            return new Response({errors: [...delegateResponse.errors, '[generateRound] Can\'t get Active delegates']});
        }

        const slots = compose(
            this.generatorPublicKeyToSlot,
            this.sortHashList,
            this.generateHashList
        )
        ({blockId: lastBlock.id, activeDelegates: delegateResponse.data});

        RoundRepository.setCurrentRound({slots, startHeight: lastBlock.height + 1});
        logger.info(`[Service][Round][generateRound] Start round id: ${RoundRepository.getCurrentRound().id}`);

        const mySlot = this.getMyTurn();

        if (mySlot) {
            // start forging block at mySlotTime
            const cellTime = SlotService.getSlotTime(mySlot - SlotService.getSlotNumber());
            logger.info(`[Service][Round][generateRound] Start forging block to: ${mySlot} after ${cellTime} seconds`);
            createTaskON('BLOCK_GENERATE', cellTime, {
                timestamp: SlotService.getSlotTime(mySlot),
                keypair: this.keypair,
            });
        }

        // create event for end of current round
        // lastSlot + 1 for waiting finish last round
        const lastSlot = RoundRepository.getLastSlotInRound();
        const RoundEndTime = SlotService.getSlotTime(lastSlot + 1 - SlotService.getSlotNumber());
        createTaskON('ROUND_FINISH', RoundEndTime);

        return new Response();
    }

    public getMyTurn(): number {
        return RoundRepository.getCurrentRound().slots[constants.publicKey].slot;
    }

    public async sumRound(round: Round): Promise<Response<IRoundSum>> {
        // load blocks forged in the last round

        const limit = Object.keys(round.slots).length;
        const blockResponse = await BlockRepository.loadBlocksOffset(round.startHeight, limit);

        if (!blockResponse.success) {
            return new Response({errors: [...blockResponse.errors, 'sumRound']});
        }

        const resp: IRoundSum = {
            roundFees: 0,
            roundDelegates: []
        };

        const blocks = blockResponse.data;

        for (let i = 0; i < blocks.length; i++) {
            resp.roundFees += blocks[i].fee;
            resp.roundDelegates.push(blocks[i].generatorPublicKey);
        }

        return new Response({data: resp});
    }

    public rebuild(): void {
    }

    public rollBack(): void {
    }

    public validate(): boolean {
        return undefined;
    }

    public async applyUnconfirmed(param: Promise<Response<IRoundSum>>): Promise<Response<Array<string>>> {
        const roundSumResponse = await param;
        if (!roundSumResponse.success) {
            return new Response({errors: [...roundSumResponse.errors, 'applyUnconfirmed']});
        }
        // increase delegates balance
        const delegates = roundSumResponse.data.roundDelegates;
        const fee = Math.floor(roundSumResponse.data.roundFees / delegates.length);

        for (let i = 0; i < delegates.length; i++) {
            let delegateAccount = DelegateRepository.getByPublicKey(delegates[i]).account;
            AccountRepository.updateBalance(delegateAccount, delegateAccount.actualBalance + fee);
        }

        return new Response({data: delegates});
    }

    async undoUnconfirmed(round: Round = RoundRepository.getCurrentRound()): Promise<Response<Array<string>>> {
        const roundSumResponse = await this.sumRound(round);
        if (!roundSumResponse.success) {
            return new Response({errors: [...roundSumResponse.errors, 'undoUnconfirmed']});
        }
        // increase delegates balance
        const delegates = roundSumResponse.data.roundDelegates;
        const fee = Math.floor(roundSumResponse.data.roundFees / delegates.length);

        for (let i = 0; i < delegates.length; i++) {
            let delegateAccount = DelegateRepository.getByPublicKey(delegates[i]).account;
            AccountRepository.updateBalance(delegateAccount, delegateAccount.actualBalance - fee);
        }

        return new Response({data: delegates});
    }

    apply(params: Promise<Response<Array<string>>>): void {
    }

    public async undo(params: Promise<Response<Array<string>>>): void {
    }

    public calcRound(height: number): number {
        return Math.ceil(height / constants.activeDelegates); // todo round has diff amount of blocks
    }
}

export default new RoundService();
