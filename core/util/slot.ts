import config from 'shared/config';
import { Timestamp } from 'shared/model/account';

export const sortHashListFunc = (a, b) => {
    if (a.hash > b.hash) {
        return 1;
    }
    if (a.hash < b.hash) {
        return -1;
    }
    return 0;
};

export const getFirstSlotNumberInRound = (timestamp: Timestamp, activeDelegatesLength: number) => {
    let slot = timestamp / config.CONSTANTS.FORGING.SLOT_INTERVAL;
    // TODO: optimize it
    while (slot % activeDelegatesLength !== activeDelegatesLength - 1) {
        console.log(`- slot: ${slot}`);
        slot -= 1;
    }

    console.log(`= slot: ${slot}`);


    return slot;
};
