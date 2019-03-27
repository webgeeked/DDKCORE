import { ResponseEntity } from 'shared/model/response';
import * as crypto from 'crypto';
import SlotService from 'core/service/slot';
import BlockRepository from 'core/repository/block';
import { Round, Slots } from 'shared/model/round';
import RoundRepository from 'core/repository/round';
import { createTaskON, resetTaskON } from 'shared/util/bus';
import DelegateRepository from 'core/repository/delegate';
import AccountRepository from 'core/repository/account';
import { Delegate } from 'shared/model/delegate';
import { logger } from 'shared/util/logger';
import { compose } from 'core/util/common';
import RoundPGRepository from 'core/repository/round/pg';
import { Block } from 'shared/model/block';
import { ActionTypes } from 'core/util/actionTypes';
import { calculateRoundFirstSlotByTimestamp } from 'core/util/round';
import { createKeyPairBySecret } from 'shared/util/crypto';

const MAX_LATENESS_FORGE_TIME = 500;

interface IHashList {
    hash: string;
    generatorPublicKey: string;
}

interface IRoundSum {
    roundFees: number;
    roundDelegates: Array<string>;
}

interface IRoundService {

    generateHashList(params: { activeDelegates: Array<Delegate>, blockId: string }):
        Array<{ hash: string, generatorPublicKey: string }>;

    sortHashList(hashList: Array<{ hash: string, generatorPublicKey: string }>):
        Array<{ hash: string, generatorPublicKey: string }>;

    generatorPublicKeyToSlot(
        sortedHashList: Array<{ hash: string, generatorPublicKey: string }>,
        timestamp: number
    ): Slots;

    generateRound(timestamp: number): Promise<ResponseEntity<void>>;

    getMyTurn(): number;

    sumRound(round: Round): ResponseEntity<IRoundSum>;

    rebuild(): void;

    rollBack(): Promise<void>;

    validate(): boolean;

    applyUnconfirmed(param: ResponseEntity<IRoundSum>): ResponseEntity<Array<string>>;

    undoUnconfirmed(round: Round): ResponseEntity<Array<string>>;

    apply(round: Round): Promise<void>;

    undo(round: Round): Promise<void>;
}

class RoundService implements IRoundService {
    private readonly keyPair: {
        privateKey: string;
        publicKey: string;
    };
    private logPrefix: string = '[RoundService]';
    private isBlockChainReady: boolean = false;

    constructor() {
        const keyPair = createKeyPairBySecret(process.env.FORGE_SECRET);

        this.keyPair = {
            privateKey: keyPair.privateKey.toString('hex'),
            publicKey: keyPair.publicKey.toString('hex'),
        };
    }

    setIsBlockChainReady(status: boolean) {
        this.isBlockChainReady = status;
    }

    getIsBlockChainReady(): boolean {
        return this.isBlockChainReady;
    }

    public generateHashList(params: { activeDelegates: Array<Delegate>, blockId: string }): Array<IHashList> {
        return params.activeDelegates.map((delegate: Delegate) => {
            const { publicKey } = delegate.account;
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

    public generatorPublicKeyToSlot(sortedHashList: Array<IHashList>, timestamp: number): Slots {
        let firstSlot = calculateRoundFirstSlotByTimestamp(timestamp);
        return sortedHashList.reduce(
            (acc: Slots = {}, item: IHashList, i) => {
                acc[item.generatorPublicKey] = { slot: firstSlot + i };
                return acc;
            }, {});
    }

    public async restoreRounds(block: Block = BlockRepository.getLastBlock()): Promise<void> {
        if (!this.isBlockChainReady) {
            return;
        }

        if (!RoundRepository.getCurrentRound()) {
            await this.generateRound(block.createdAt);
            return;
        }

        const currentRound = RoundRepository.getCurrentRound();
        const lastSlot = RoundRepository.getLastSlotInRound();

        if (
            block &&
            currentRound &&
            block.createdAt < SlotService.getSlotTime(lastSlot)
        ) {
            // case when current slot in the past round
            if (SlotService.getSlotTime(lastSlot + 1) < SlotService.getTime()) {
                console.log('case when current slot in the past round');
                await this.generateRound();
                return;
            }
            // case when current slot in the current round
            console.log('case when current slot in the current round');
            this.startBlockGenerateTask();
            this.startRoundFinishTask();
            return;
        }

        await this.generateRound();
    }

    startBlockGenerateTask(): void {
        const mySlot = this.getMyTurn();
        if (mySlot) {
            // start forging block at mySlotTime
            let cellTime = SlotService.getSlotRealTime(mySlot) - new Date().getTime();
            if (cellTime < 0 && cellTime + MAX_LATENESS_FORGE_TIME >= 0) {
                cellTime = 0;
            }
            if (cellTime >= 0) {
                logger.info(
                    `${this.logPrefix}[generateRound] Start forging block to: ${mySlot} after ${cellTime} ms`
                );
                createTaskON(ActionTypes.BLOCK_GENERATE, cellTime, {
                    timestamp: SlotService.getSlotTime(mySlot),
                    keyPair: this.keyPair,
                });
            } else {
                logger.info(
                    `${this.logPrefix}[generateRound] Skip forging block to: ${mySlot} after ${cellTime} ms`
                );
            }
        }
    }

    startRoundFinishTask(): void {
        // create event for end of current round
        // lastSlot + 1 for waiting finish last round
        const lastSlot = RoundRepository.getLastSlotInRound();
        const roundEndTime = SlotService.getSlotRealTime(lastSlot + 1) - new Date().getTime();
        logger.debug(
            `${this.logPrefix}[generateRound] The round will be completed in ${roundEndTime} ms`
        );
        createTaskON(ActionTypes.ROUND_FINISH, roundEndTime);
    }

    public async generateRound(timestamp: number = SlotService.getTime()): Promise<ResponseEntity<void>> {
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
            // TODO update prev round
        }

        const lastBlock = BlockRepository.getLastBlock();
        if (lastBlock == null) {
            logger.error(`${this.logPrefix}[generateRound] Can't start round: lastBlock is undefined`);
            return new ResponseEntity<void>({
                errors: [`${this.logPrefix}[generateRound] Can't start round: lastBlock is undefined`]
            });
        }

        const activeDelegates = DelegateRepository.getActiveDelegates();

        const hashList = this.generateHashList({ blockId: lastBlock.id, activeDelegates });
        const sortedHashList = this.sortHashList(hashList);
        const slots = this.generatorPublicKeyToSlot(sortedHashList, timestamp);

        const newCurrentRound = new Round({
            startHeight: lastBlock.height + 1,
            slots: slots,
        });
        RoundRepository.setCurrentRound(newCurrentRound);

        await this.apply(newCurrentRound);

        logger.info(
            `${this.logPrefix}[generateRound] Start round on height: ${RoundRepository.getCurrentRound().startHeight}`
        );

        this.startBlockGenerateTask();
        this.startRoundFinishTask();

        return new ResponseEntity<void>();
    }

    public getMyTurn(): number {
        const mySlot = RoundRepository.getCurrentRound().slots[this.keyPair.publicKey];
        return mySlot && mySlot.slot;
    }

    public sumRound(round: Round): ResponseEntity<IRoundSum> {
        // load blocks forged in the last round

        const limit = Object.keys(round.slots).length;
        const blocks = BlockRepository.getMany(limit, round.startHeight);

        const resp: IRoundSum = {
            roundFees: 0,
            roundDelegates: []
        };

        for (let i = 0; i < blocks.length; i++) {
            resp.roundFees += blocks[i].fee;
            resp.roundDelegates.push(blocks[i].generatorPublicKey);
        }

        return new ResponseEntity<IRoundSum>({ data: resp });
    }

    public rebuild(): void {
    }

    public async rollBack(): Promise<void> {
        resetTaskON(ActionTypes.BLOCK_GENERATE);
        resetTaskON(ActionTypes.ROUND_FINISH);
        await this.undo(RoundRepository.getCurrentRound());
        this.undoUnconfirmed(RoundRepository.getPrevRound());
    }

    public validate(): boolean {
        return undefined;
    }

    public applyUnconfirmed(param: ResponseEntity<IRoundSum>): ResponseEntity<Array<string>> {
        const roundSumResponse = param;
        if (!roundSumResponse.success) {
            return new ResponseEntity<Array<string>>({ errors: [...roundSumResponse.errors, 'applyUnconfirmed'] });
        }
        // increase delegates balance
        const delegates = roundSumResponse.data.roundDelegates;
        const fee = Math.floor(roundSumResponse.data.roundFees / delegates.length);

        delegates.forEach(publicKey => {
            const delegateAccount = AccountRepository.getByPublicKey(publicKey);
            delegateAccount.actualBalance += fee;
        });

        return new ResponseEntity<Array<string>>({ data: delegates });
    }

    public undoUnconfirmed(round: Round = RoundRepository.getCurrentRound()): ResponseEntity<Array<string>> {
        const roundSumResponse = this.sumRound(round);
        if (!roundSumResponse.success) {
            return new ResponseEntity<Array<string>>({ errors: [...roundSumResponse.errors, 'undoUnconfirmed'] });
        }
        // increase delegates balance
        const delegates = roundSumResponse.data.roundDelegates;
        const fee = Math.floor(roundSumResponse.data.roundFees / delegates.length);

        delegates.forEach(publicKey => {
            const delegateAccount = AccountRepository.getByPublicKey(publicKey);
            delegateAccount.actualBalance -= fee;
        });

        return new ResponseEntity<Array<string>>({ data: delegates });
    }

    public async apply(round: Round = RoundRepository.getCurrentRound()): Promise<void> {
        await RoundPGRepository.saveOrUpdate(round);
    }

    public async undo(round: Round = RoundRepository.getCurrentRound()): Promise<void> {
        await RoundPGRepository.delete(round);
    }
}

export default new RoundService();
