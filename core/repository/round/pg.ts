import {Round} from 'shared/model/round';
import db, { pgpE } from 'shared/driver/db/index';
import {IRoundPGRepository as IRoundPGRepositoryShared, RawRound} from 'shared/repository/round';
import queries from 'core/repository/queries/round';

export interface IRoundPGRepository extends IRoundPGRepositoryShared {

}

class RoundPGRepository implements IRoundPGRepository {
    private readonly tableName: string = 'round';
    private readonly tableFields: Array<string> = [
        'height_start',
        'height_finish',
        'slot'
    ];
    private readonly columnSet = new pgpE.helpers.ColumnSet(this.tableFields, {table: this.tableName});


    serialize(round: Round): RawRound {
        return {
            height_start: round.startHeight,
            height_end: round.endHeight,
            slots: round.slots
        };
    }

    deserialize(rawRound: RawRound, radix = 10): Round {
        return new Round({
            startHeight: parseInt(rawRound.height_start, radix),
            endHeight: parseInt(rawRound.height_end, radix),
            slots: rawRound.slots
        });
    }

    async getByHeight(height: number): Promise<Round> {
        const rawRound: RawRound = await db.oneOrNone(queries.getByHeight, { height });
        return this.deserialize(rawRound);
    }

    async getMany(offset: number, limit?: number): Promise<Array<Round>> {
        const rawRounds: Array<RawRound> = await db.manyOrNone(queries.getMany(limit), { offset, limit });
        const rounds: Array<Round> = rawRounds.map(rawRound => this.deserialize(rawRound));
        return rounds;
    }

    async saveOrUpdate(round: Round | Array<Round>): Promise<void> {
        const rounds: Array<Round> = [].concat(round);
        const values: Array<object> = [];
        rounds.forEach((roundEntity) => {
            values.push(this.serialize(roundEntity));
        });
        const query = pgpE.helpers.insert(values, this.columnSet) +
            ' ON CONFLICT(height_start) DO UPDATE SET ' +
            this.columnSet.assignColumns({from: 'EXCLUDED', skip: ['height_start', 'height_finish']});
        await db.none(query);
        return null;
    }
}

export default new RoundPGRepository();
