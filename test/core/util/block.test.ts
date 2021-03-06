import { expect } from 'chai';
import * as blockUtils from 'core/util/block';
import { Block } from 'shared/model/block';

const previousBlock = new Block({
    id: '9',
    createdAt: 90,
    previousBlockId: '8',
    height: 9,
    transactions: []
});

const lastBlock = new Block({
    id: '10',
    createdAt: 100,
    previousBlockId: '9',
    height: 10,
    transactions: []
});

const anotherPreviousBlock = new Block({
    id: '10',
    createdAt: 110,
    previousBlockId: '9A',
    height: 10,
    transactions: []
});

const nextBlock = new Block({
    id: '11',
    createdAt: 110,
    previousBlockId: '10',
    height: 11,
    transactions: []
});

const nextBlockWithAnotherPreviousBlockId = new Block({
    id: '11',
    createdAt: 110,
    previousBlockId: '10A',
    height: 11,
    transactions: []
});

const highestBlock = new Block({
    id: '20',
    createdAt: 200,
    previousBlockId: '19',
    height: 20,
    transactions: []
});

describe('Block utils', () => {
    describe('is height less', () => {
        it('previous block', () => {
            expect(blockUtils.isLessHeight(lastBlock, previousBlock)).equal(true);
        });

        it('equal block', () => {
            expect(blockUtils.isLessHeight(lastBlock, lastBlock)).equal(false);
        });

        it('next block', () => {
            expect(blockUtils.isLessHeight(lastBlock, nextBlock)).equal(false);
        });
    });

    describe('is next', () => {
        it('next block', () => {
            expect(blockUtils.isNext(lastBlock, nextBlock)).equal(true);
        });

        it('equal block', () => {
            expect(blockUtils.isNext(lastBlock, lastBlock)).equal(false);
        });

        it('previous block', () => {
            expect(blockUtils.isNext(lastBlock, previousBlock)).equal(false);
        });

        it('highest block', () => {
            expect(blockUtils.isNext(lastBlock, highestBlock)).equal(false);
        });
    });

    describe('is equal id', () => {
        it('equal block', () => {
            expect(blockUtils.isEqualId(lastBlock, lastBlock)).equal(true);
        });

        it('next block', () => {
            expect(blockUtils.isEqualId(lastBlock, nextBlock)).equal(false);
        });

        it('previous block', () => {
            expect(blockUtils.isEqualId(lastBlock, previousBlock)).equal(false);
        });

        it('highest block', () => {
            expect(blockUtils.isEqualId(lastBlock, highestBlock)).equal(false);
        });
    });

    describe('is equal previous block', () => {
        it('equal block', () => {
            expect(blockUtils.isEqualPreviousBlock(lastBlock, lastBlock)).equal(true);
        });

        it('another previous block', () => {
            expect(blockUtils.isEqualPreviousBlock(lastBlock, anotherPreviousBlock)).equal(false);
        });
    });

    describe('is equal height', () => {
        it('equal block', () => {
            expect(blockUtils.isEqualHeight(lastBlock, lastBlock)).equal(true);
        });

        it('same height block', () => {
            expect(blockUtils.isEqualHeight(lastBlock, anotherPreviousBlock)).equal(true);
        });

        it('next block', () => {
            expect(blockUtils.isEqualHeight(lastBlock, nextBlock)).equal(false);
        });

        it('previous block', () => {
            expect(blockUtils.isEqualHeight(lastBlock, previousBlock)).equal(false);
        });

        it('highest block', () => {
            expect(blockUtils.isEqualHeight(lastBlock, highestBlock)).equal(false);
        });
    });

    describe('is received block above', () => {
        it('equal block', () => {
            expect(blockUtils.isGreatestHeight(lastBlock, lastBlock)).equal(false);
        });

        it('same height block', () => {
            expect(blockUtils.isGreatestHeight(lastBlock, anotherPreviousBlock)).equal(false);
        });

        it('next block', () => {
            expect(blockUtils.isGreatestHeight(lastBlock, nextBlock)).equal(true);
        });

        it('previous block', () => {
            expect(blockUtils.isGreatestHeight(lastBlock, previousBlock)).equal(false);
        });

        it('highest block', () => {
            expect(blockUtils.isGreatestHeight(lastBlock, highestBlock)).equal(true);
        });
    });

    describe('is last block invalid', () => {
        it('next block', () => {
            expect(blockUtils.isLastBlockInvalid(lastBlock, nextBlock)).equal(false);
        });

        it('next block with another previous block id', () => {
            expect(blockUtils.isLastBlockInvalid(lastBlock, nextBlockWithAnotherPreviousBlockId)).equal(true);
        });
    });

    describe('can be processed', () => {
        it('equal block', () => {
            expect(blockUtils.isBlockCanBeProcessed(lastBlock, lastBlock)).equal(false);
        });

        it('same height block', () => {
            expect(blockUtils.isBlockCanBeProcessed(lastBlock, anotherPreviousBlock)).equal(false);
        });

        it('next block', () => {
            expect(blockUtils.isBlockCanBeProcessed(lastBlock, nextBlock)).equal(true);
        });

        it('previous block', () => {
            expect(blockUtils.isBlockCanBeProcessed(lastBlock, previousBlock)).equal(false);
        });

        it('next block with another previous block id', () => {
            expect(blockUtils.isBlockCanBeProcessed(lastBlock, nextBlockWithAnotherPreviousBlockId)).equal(false);
        });
    });
});
