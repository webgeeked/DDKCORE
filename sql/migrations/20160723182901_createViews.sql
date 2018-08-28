/* Create Views
 *
 */

BEGIN;

DROP VIEW IF EXISTS blocks_list;

CREATE VIEW blocks_list AS

SELECT b."id" AS "b_id",
       b."version" AS "b_version",
       b."timestamp" AS "b_timestamp",
       b."height" AS "b_height",
       b."previousBlock" AS "b_previousBlock",
       b."numberOfTransactions" AS "b_numberOfTransactions",
       b."totalAmount" AS "b_totalAmount",
       b."totalFee" AS "b_totalFee",
       b."reward" AS "b_reward",
       b."payloadLength" AS "b_payloadLength",
       ENCODE(b."payloadHash", 'hex') AS "b_payloadHash",
       ENCODE(b."generatorPublicKey", 'hex') AS "b_generatorPublicKey",
       ENCODE(b."blockSignature", 'hex') AS "b_blockSignature",
       (SELECT MAX("height") + 1 FROM blocks) - b."height" AS "b_confirmations"

FROM blocks b;

DROP VIEW IF EXISTS full_blocks_list;

CREATE VIEW full_blocks_list AS

SELECT b."id" AS "b_id",
       b."version" AS "b_version",
       b."timestamp" AS "b_timestamp",
       b."height" AS "b_height",
       b."previousBlock" AS "b_previousBlock",
       b."numberOfTransactions" AS "b_numberOfTransactions",
       (b."totalAmount")::bigint AS "b_totalAmount",
       (b."totalFee")::bigint AS "b_totalFee",
       (b."reward")::bigint AS "b_reward",
       b."payloadLength" AS "b_payloadLength",
       ENCODE(b."payloadHash", 'hex') AS "b_payloadHash",
       ENCODE(b."generatorPublicKey", 'hex') AS "b_generatorPublicKey",
       ENCODE(b."blockSignature", 'hex') AS "b_blockSignature",
       t."id" AS "t_id",
       t."rowId" AS "t_rowId",
       t."type" AS "t_type",
       t."timestamp" AS "t_timestamp",
       ENCODE(t."senderPublicKey", 'hex') AS "t_senderPublicKey",
       t."senderId" AS "t_senderId",
       t."recipientId" AS "t_recipientId",
       (t."amount")::bigint AS "t_amount",
       (t."fee")::bigint AS "t_fee",
       ENCODE(t."signature", 'hex') AS "t_signature",
       ENCODE(t."signSignature", 'hex') AS "t_signSignature",
       t."stakedAmount" AS "t_stakedAmount",
       t."stakeId" AS "t_stakeId",
       t."groupBonus" AS "t_groupBonus",
       ENCODE(s."publicKey", 'hex') AS "s_publicKey",
       d."username" AS "d_username",
       v."votes" AS "v_votes",
       m."min" AS "m_min",
       m."lifetime" AS "m_lifetime",
       m."keysgroup" AS "m_keysgroup",
       dapp."name" AS "dapp_name",
       dapp."description" AS "dapp_description",
       dapp."tags" AS "dapp_tags",
       dapp."type" AS "dapp_type",
       dapp."link" AS "dapp_link",
       dapp."category" AS "dapp_category",
       dapp."icon" AS "dapp_icon",
       it."dappId" AS "in_dappId",
       ot."dappId" AS "ot_dappId",
       ot."outTransactionId" AS "ot_outTransactionId",
       ENCODE(t."requesterPublicKey", 'hex') AS "t_requesterPublicKey",
       t."signatures" AS "t_signatures",
       so."id" AS "so_id",
       so."status" AS "so_status",
       so."startTime" AS "so_startTime",
       so."insertTime" AS "so_insertTime",
       so."senderId" AS "so_senderId",
       so."recipientId" AS "so_recipientId",
       so."freezedAmount" AS "so_freezedAmount",
       so."nextVoteMilestone" AS "so_nextVoteMilestone"

FROM blocks b

LEFT OUTER JOIN trs AS t ON t."blockId" = b."id"
LEFT OUTER JOIN delegates AS d ON d."transactionId" = t."id"
LEFT OUTER JOIN votes AS v ON v."transactionId" = t."id"
LEFT OUTER JOIN signatures AS s ON s."transactionId" = t."id"
LEFT OUTER JOIN multisignatures AS m ON m."transactionId" = t."id"
LEFT OUTER JOIN dapps AS dapp ON dapp."transactionId" = t."id"
LEFT OUTER JOIN intransfer AS it ON it."transactionId" = t."id"
LEFT OUTER JOIN outtransfer AS ot ON ot."transactionId" = t."id"
LEFT JOIN stake_orders so ON so."id" = t."id";

DROP VIEW IF EXISTS trs_list;

CREATE VIEW trs_list AS

SELECT t."id" AS "t_id",
       b."height" AS "b_height",
       t."blockId" AS "t_blockId",
       t."type" AS "t_type",
       t."timestamp" AS "t_timestamp",
       ENCODE(t."senderPublicKey", 'hex') AS "t_senderPublicKey",
       t."senderId" AS "t_senderId",
       t."recipientId" AS "t_recipientId",
       t."amount" AS "t_amount",
       t."stakedAmount" AS "t_stakedAmount",
       t."stakeId" AS "t_stakeId",
       t."groupBonus" AS "t_groupBonus",
       t."fee" AS "t_fee",
       ENCODE(t."signature", 'hex') AS "t_signature",
       ENCODE(t."signSignature", 'hex') AS "t_SignSignature",
       t."signatures" AS "t_signatures",
       t."trsName" AS "t_trsName",
       (SELECT MAX("height") + 1 FROM blocks) - b."height" AS "confirmations",
       s."id" AS "s_id"

FROM trs t

INNER JOIN blocks b ON t."blockId" = b."id"
LEFT JOIN stake_orders s ON s."id" = t."id";

COMMIT;
