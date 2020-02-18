import { Stake } from 'ddk.registry/dist/model/common/transaction/stake';
import AirdropReferredUsersTree from 'core/repository/referredUsers/tree/AirdropReferredUsersTree';
import { Account } from 'shared/model/account';
import DDKRegistry from 'ddk.registry';

export default class ARPReferredUsersTree extends AirdropReferredUsersTree {

    protected getAccountReferrals(account: Account): Array<Account> {
        return account.arp.referrals.map(referral => new Account(referral));
    }

    protected getAccountActiveStakes(account: Account): Array<Stake> {
        return account.arp.stakes.filter(stake => stake.isActive);
    }

    protected get referralMaxCount(): number {
        return DDKRegistry.config.ARP.DIRECT_REWARD.PERCENT_PER_LEVEL.length;
    }

}