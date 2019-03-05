import {IAssetService} from '../transaction';
import {
    IAssetStake,
    Transaction,
    TransactionType,
    IAirdropAsset,
} from 'shared/model/transaction';
import ResponseEntity from 'shared/model/response';
import {Address, Account} from 'shared/model/account';
import AccountRepo from 'core/repository/account';
import { TOTAL_PERCENTAGE } from 'core/util/const';
import config from 'shared/util/config';
import BUFFER from 'core/util/buffer';

import { getAirdropReward, verifyAirdrop } from 'core/util/reward';

import {ITableObject} from 'core/util/common';

class TransactionStakeService implements IAssetService<IAssetStake>  {

    create(trs: Transaction<IAssetStake>, data?: IAssetStake ): IAssetStake {
        const sender: Account = AccountRepo.getByAddress(trs.senderAddress);
        const airdropReward: IAirdropAsset = getAirdropReward(
                sender,
                data.amount,
                TransactionType.STAKE
            );
        const asset: IAssetStake = {
            amount: data.amount,
            startTime: trs.createdAt,
            startVoteCount: trs.createdAt,
            airdropReward: airdropReward
        };

        return asset;
    }

    getBytes(trs: Transaction<IAssetStake>): Buffer {
        let offset = 0;
        const buff = Buffer.alloc(
            BUFFER.LENGTH.INT64 +  // asset.stakeOrder.stakedAmount
            // BUFFER.LENGTH.UINT32 + // asset.stakeOrder.nextVoteMilestone
            BUFFER.LENGTH.UINT32 + // asset.stakeOrders.startTime
            BUFFER.LENGTH.BYTE +   // asset.airdropReward.withAirdropReward
            BUFFER.LENGTH.INT64    // asset.airdropReward.totalReward
        );
        offset = BUFFER.writeUInt64LE(buff, trs.asset.amount || 0, offset);
        /**
         * TODO Should be async?
         */
        // const block: ResponseEntity<Block> = BlockRepo.loadFullBlockById(trs.blockId);

        // if (block.data.height <= config.constants.MASTER_NODE_MIGRATED_BLOCK) {
        //     buff.writeInt32LE(trs.asset.stakeOrder.nextVoteMilestone, offset);
        // }

        offset += BUFFER.LENGTH.UINT32;
        buff.writeInt32LE(trs.asset.startTime, offset);
        offset += BUFFER.LENGTH.UINT32;
        buff.writeInt8( 0, offset);
        offset += BUFFER.LENGTH.BYTE;
        BUFFER.writeUInt64LE(buff, 0, offset);

        const referralBuffer = Buffer.alloc(BUFFER.LENGTH.INT64 + BUFFER.LENGTH.INT64);
        offset = 0;
        if (trs.asset.airdropReward.sponsors && Object.keys(trs.asset.airdropReward.sponsors).length > 0) {
            const address: Address = parseInt(Object.keys(trs.asset.airdropReward.sponsors)[0], 10);
            offset = BUFFER.writeUInt64LE(referralBuffer, address, offset);
            BUFFER.writeUInt64LE(referralBuffer, trs.asset.airdropReward.sponsors[address] || 0, offset);
        }

        return Buffer.concat([buff, referralBuffer]);
    }

    verifyUnconfirmed(trs: Transaction<IAssetStake>, sender: Account): ResponseEntity<void> {
        return new ResponseEntity();
    }

    validate(trs: Transaction<IAssetStake>, sender: Account): ResponseEntity<any> {
        let errors = [];
        if (trs.asset.amount <= 0 && config.constants.STAKE_VALIDATE.AMOUNT_ENABLED) {
            errors.push('Invalid transaction amount');
        }

        if ((trs.asset.amount % 1) !== 0 && config.constants.STAKE_VALIDATE.AMOUNT_ENABLED) {
            errors.push('Invalid stake amount: Decimal value');
        }

        const airdropCheck: ResponseEntity<any> = verifyAirdrop(trs, trs.asset.amount, sender);
        if (!airdropCheck.success && config.constants.STAKE_VALIDATE.AIRDROP_ENABLED) {
            errors = errors.concat(airdropCheck.errors);
        }
        return new ResponseEntity({ errors });
    }

    calculateFee(trs: Transaction<IAssetStake>, sender?: Account): number {
        return (trs.asset.amount * config.constants.fees.froze) / TOTAL_PERCENTAGE;
    }

    calculateUndoUnconfirmed(trs: Transaction<IAssetStake>, sender: Account): void {
        return;
    }

    applyUnconfirmed(trs: Transaction<IAssetStake>): ResponseEntity<void> {
        const totalAmount: number = trs.fee + trs.asset.amount;
        return AccountRepo.updateBalanceByAddress(trs.senderAddress, totalAmount * (-1));
    }

    undoUnconfirmed(trs: Transaction<IAssetStake>, sender: Account): ResponseEntity<void> {
        const fee: number = this.calculateFee(trs);
        const totalAmount: number = fee + trs.asset.amount;
        return AccountRepo.updateBalanceByAddress(trs.senderAddress, totalAmount);
    }

    async apply(trs: Transaction<IAssetStake>): Promise<ResponseEntity<void>> {
        return new ResponseEntity<void>();
    }

    async undo(trs: Transaction<IAssetStake>): Promise<ResponseEntity<void>> {
        return new ResponseEntity<void>();
    }

    dbRead(fullTrsObject: any): Transaction<IAssetStake> {
        return null;
    }

    dbSave(trs: Transaction<IAssetStake>): Array<ITableObject>  {
        return null;
    }
}

export default new TransactionStakeService();
