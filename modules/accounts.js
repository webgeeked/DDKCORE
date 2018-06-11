'use strict';

var bignum = require('../helpers/bignum.js');
var BlockReward = require('../logic/blockReward.js');
var constants = require('../helpers/constants.js');
var crypto = require('crypto');
var extend = require('extend');
var schema = require('../schema/accounts.js');
var sandboxHelper = require('../helpers/sandbox.js');
var transactionTypes = require('../helpers/transactionTypes.js');
var Vote = require('../logic/vote.js');
var sql = require('../sql/accounts.js');
var contracts = require('./contracts.js')
var userGroups = require('../helpers/userGroups.js');
var cache = require('./cache.js');
var config = require('../config.json');
var utils = require('../utils');
var jwt = require('jsonwebtoken');
var QRCode = require('qrcode');
var cache = require('./cache.js');
var speakeasy = require("speakeasy");
var slots = require('../helpers/slots.js');
var httpApi = require('../helpers/httpApi');
var Promise = require('bluebird');
var async = require('async');
var nextBonus = 0;

// Private fields
var modules, library, self, __private = {}, shared = {};

__private.assetTypes = {};
__private.blockReward = new BlockReward();

/**
 * Initializes library with scope content and generates a Vote instance.
 * Calls logic.transaction.attachAssetType().
 * @memberof module:accounts
 * @class
 * @classdesc Main accounts methods.
 * @implements module:accounts.Account#Vote
 * @param {scope} scope - App instance.
 * @param {function} cb - Callback function.
 * @return {setImmediateCallback} Callback function with `self` as data.
 */
function Accounts(cb, scope) {
	library = {
		ed: scope.ed,
		db: scope.db,
		cache: scope.cache,
		logger: scope.logger,
		schema: scope.schema,
		balancesSequence: scope.balancesSequence,
		logic: {
			account: scope.logic.account,
			transaction: scope.logic.transaction,
			contract: scope.logic.contract,
			vote: scope.logic.vote
		},
		config: scope.config
	};
	self = this;

	__private.assetTypes[transactionTypes.VOTE] = library.logic.transaction.attachAssetType(
		transactionTypes.VOTE,
		new Vote(
			scope.logger,
			scope.schema,
			scope.db
		)
	);

	setImmediate(cb, null, self);
}

/**
 * Gets account from publicKey obtained from secret parameter.
 * If not existes, generates new account data with public address
 * obtained from secret parameter.
 * @private
 * @param {function} secret
 * @param {function} cb - Callback function.
 * @returns {setImmediateCallback} As per logic new|current account data object.
 */
__private.openAccount = function (secret, cb) {
	var hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
	var keypair = library.ed.makeKeypair(hash);
	var publicKey = keypair.publicKey.toString('hex');

	self.getAccount({ publicKey: publicKey }, function (err, account) {
		if (err) {
			return setImmediate(cb, err);
		}

		if (account) {
			if (account.publicKey == null) {
				account.publicKey = publicKey;
			}
			return setImmediate(cb, null, account);
		} else {
			var account = {
				address: self.generateAddressByPublicKey(publicKey),
				u_balance: '0',
				balance: '0',
				publicKey: publicKey,
				u_secondSignature: 0,
				secondSignature: 0,
				secondPublicKey: null,
				multisignatures: null,
				u_multisignatures: null
			}
			return setImmediate(cb, null, account);
		}
	});
};

/**
 * Generates address based on public key.
 * @param {publicKey} publicKey - PublicKey.
 * @returns {address} Address generated.
 * @throws {string} If address is invalid throws `Invalid public key`.
 */
Accounts.prototype.generateAddressByPublicKey = function (publicKey) {
	var publicKeyHash = crypto.createHash('sha256').update(publicKey, 'hex').digest();
	var temp = Buffer.alloc(8);

	for (var i = 0; i < 8; i++) {
		temp[i] = publicKeyHash[7 - i];
	}

	var address = 'DDK' + bignum.fromBuffer(temp).toString();

	if (!address) {
		throw 'Invalid public key: ' + publicKey;
	}

	return address;
};

/**
 * Gets account information, calls logic.account.get().
 * @implements module:accounts#Account~get
 * @param {Object} filter - Containts publicKey.
 * @param {function} fields - Fields to get.
 * @param {function} cb - Callback function.
 */
Accounts.prototype.getAccount = function (filter, fields, cb) {
	if (filter.publicKey) {
		filter.address = self.generateAddressByPublicKey(filter.publicKey);
		delete filter.publicKey;
	}

	library.logic.account.get(filter, fields, cb);
};


Accounts.prototype.referralLinkChain = function(referalLink,address,cb) {

	var referralLink = referalLink;
	if(referralLink == undefined) {
		referralLink = "";
	}
	var decoded = new Buffer(referralLink, 'base64').toString('ascii');
	var level =[];

	level.unshift(decoded);

	if(decoded == address)
	{
		var err = "Introducer and sponsor can't be same";
		return setImmediate(cb, err);
	}		

		async.series([

			function(callback){
				if (referralLink != "") {
					library.db.one(sql.findReferLink, {
						referLink: referralLink
					}).then(function (user) {
						if (parseInt(user.address)) {
							callback();
						} else {
							var error = "Referral Link is Invalid";
							return setImmediate(cb, error);
						}
					}).catch(function (err) {
						return setImmediate(cb, err);
					});
				} else {
					callback();
				}
			},
			function(callback) {
				if(referralLink!="") {
					library.logic.account.findReferralLevel(decoded,function(err,resp){
						if (err) {
							console.log(err);							
							return setImmediate(cb, err);
						}
						if(resp.level !=null && resp.level[0] !="0") {
							level=level.concat(resp.level);
						}
						console.log(level);
						callback();
					});
				}
				else {
					level.length = 0;	
					callback();
				}			
			},
			function(callback){
				var levelDetails = {
					address: address,
					level:level
				};
	
				library.logic.account.insertLevel(levelDetails,function(err){
					if (err) {
						console.log(err);
						return setImmediate(cb, err);
					}
					level.length = 0;
					callback();
				});
			}
		],function(err){
			if(err) return err;
			else return setImmediate(cb, null);
		});
}

/**
 * Gets accounts information, calls logic.account.getAll().
 * @implements module:accounts#Account~getAll
 * @param {Object} filter
 * @param {Object} fields
 * @param {function} cb - Callback function.
 */
Accounts.prototype.getAccounts = function (filter, fields, cb) {
	library.logic.account.getAll(filter, fields, cb);
};

/**
 * Validates input address and calls logic.account.set() and logic.account.get().
 * @implements module:accounts#Account~set
 * @implements module:accounts#Account~get
 * @param {Object} data - Contains address or public key to generate address.
 * @param {function} cb - Callback function.
 * @returns {setImmediateCallback} Errors.
 * @returns {function()} Call to logic.account.get().
 */
Accounts.prototype.setAccountAndGet = function (data, cb) {
	var address = data.address || null;
	var err;

	if (address === null) {
		if (data.publicKey) {
			address = self.generateAddressByPublicKey(data.publicKey);
		} else {
			err = 'Missing address or public key';
		}
	}

	if (!address) {
		err = 'Invalid public key';
	}

	if (err) {
		if (typeof cb === 'function') {
			return setImmediate(cb, err);
		} else {
			throw err;
		}
	}

	library.logic.account.set(address, data, function (err) {
		if (err) {
			return setImmediate(cb, err);
		}
		return library.logic.account.get({ address: address }, cb);
	});
};

/**
 * Validates input address and calls logic.account.merge().
 * @implements module:accounts#Account~merge
 * @param {Object} data - Contains address and public key.
 * @param {function} cb - Callback function.
 * @returns {setImmediateCallback} for errors wit address and public key.
 * @returns {function} calls to logic.account.merge().
 * @todo improve publicKey validation try/catch
 */
Accounts.prototype.mergeAccountAndGet = function (data, cb) {
	var address = data.address || null;
	var err;

	if (address === null) {
		if (data.publicKey) {
			address = self.generateAddressByPublicKey(data.publicKey);
		} else {
			err = 'Missing address or public key';
		}
	}

	if (!address) {
		err = 'Invalid public key';
	}

	if (err) {
		if (typeof cb === 'function') {
			return setImmediate(cb, err);
		} else {
			throw err;
		}
	}
	/* library.logic.account.merge('4995063339468361088E', {
		balance: -'500000000'
	}, function (err, sender) {
		//console.log('sender : ', sender);
	}); */
	return library.logic.account.merge(address, data, cb);
};

/**
 * Calls helpers.sandbox.callMethod().
 * @implements module:helpers#callMethod
 * @param {function} call - Method to call.
 * @param {} args - List of arguments.
 * @param {function} cb - Callback function.
 * @todo verified function and arguments.
 */
Accounts.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
};

// Events
/**
 * Calls Vote.bind() with scope.
 * @implements module:accounts#Vote~bind
 * @param {modules} scope - Loaded modules.
 */
Accounts.prototype.onBind = function (scope) {
	modules = {
		delegates: scope.delegates,
		accounts: scope.accounts,
		transactions: scope.transactions,
		blocks: scope.blocks
	};

	__private.assetTypes[transactionTypes.VOTE].bind(
		scope.delegates,
		scope.rounds,
		scope.accounts
	);
};
/**
 * Checks if modules is loaded.
 * @return {boolean} true if modules is loaded
 */
Accounts.prototype.isLoaded = function () {
	return !!modules;
};

// Shared API
/**
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
Accounts.prototype.shared = {
	open: function (req, cb) {
		library.schema.validate(req.body, schema.open, function (err) {
			if (err) {
				return setImmediate(cb, err[0].message);
			}

			__private.openAccount(req.body.secret, function (err, account) {
				if (!err) {
					var payload = {
						secret: req.body.secret,
						address: account.address
					};
					var token = jwt.sign(payload, library.config.jwt.secret, {
						expiresIn: library.config.jwt.tokenLife,
						mutatePayload: true
					});

					var REDIS_KEY_USER_INFO_HASH = "userInfo_" + account.address;

					var accountData = {
						address: account.address,
						unconfirmedBalance: account.u_balance,
						balance: account.balance,
						publicKey: account.publicKey,
						unconfirmedSignature: account.u_secondSignature,
						secondSignature: account.secondSignature,
						secondPublicKey: account.secondPublicKey,
						multisignatures: account.multisignatures,
						u_multisignatures: account.u_multisignatures,
						totalFrozeAmount: account.totalFrozeAmount
					};

					accountData.token = token;

					//library.cache.client.set('jwtToken_' + account.address, token, 'ex', 100);
					/****************************************************************/

					cache.prototype.isExists(REDIS_KEY_USER_INFO_HASH, function (err, isExist) {
						
						if (!isExist) {
							self.referralLinkChain(req.body.referal, account.address, function (error) {
								if (error) {
									return setImmediate(cb, error);
								} else {
									var data = {
										address: accountData.address,
										u_isDelegate: 0,
										isDelegate: 0,
										vote: 0,
										publicKey: accountData.publicKey
									};
									if (account.u_isDelegate) {
										data.u_isDelegate = account.u_isDelegate;
									}
									if (account.isDelegate) {
										data.isDelegate = account.isDelegate;
									}
									if (account.vote) {
										data.vote = account.vote;
									}
									library.logic.account.set(accountData.address, data, function (error) {
										if (!error) {
											cache.prototype.setJsonForKey(REDIS_KEY_USER_INFO_HASH, accountData.address);
											return setImmediate(cb, null, {
												account: accountData
											});
										} else {
											return setImmediate(cb, error);
										}
									});
								}
							});
						} else {
							return setImmediate(cb, null, {
								account: accountData
							});
						}
					});

				} else {
					return setImmediate(cb, error);
				}
			});
		});
	},

	getBalance: function (req, cb) {
		library.schema.validate(req.body, schema.getBalance, function (err) {
			if (err) {
				return setImmediate(cb, err[0].message);
			}

			self.getAccount({ address: req.body.address }, function (err, account) {
				if (err) {
					return setImmediate(cb, err);
				}

				var balance = account ? account.balance : '0';
				var unconfirmedBalance = account ? account.u_balance : '0';

				return setImmediate(cb, null, { balance: balance, unconfirmedBalance: unconfirmedBalance });
			});
		});
	},

	getPublickey: function (req, cb) {
		library.schema.validate(req.body, schema.getPublicKey, function (err) {
			if (err) {
				return setImmediate(cb, err[0].message);
			}

			self.getAccount({ address: req.body.address }, function (err, account) {
				if (err) {
					return setImmediate(cb, err);
				}

				if (!account || !account.publicKey) {
					return setImmediate(cb, 'Account not found');
				}

				return setImmediate(cb, null, { publicKey: account.publicKey });
			});
		});
	},

	generatePublicKey: function (req, cb) {
		library.schema.validate(req.body, schema.generatePublicKey, function (err) {
			if (err) {
				return setImmediate(cb, err[0].message);
			}

			__private.openAccount(req.body.secret, function (err, account) {
				var publicKey = null;

				if (!err && account) {
					publicKey = account.publicKey;
				}

				return setImmediate(cb, err, {
					publicKey: publicKey
				});
			});
		});
	},

	getDelegates: function (req, cb) {
		library.schema.validate(req.body, schema.getDelegates, function (err) {
			if (err) {
				return setImmediate(cb, err[0].message);
			}

			self.getAccount({ address: req.body.address }, function (err, account) {
				if (err) {
					return setImmediate(cb, err);
				}

				if (!account) {
					return setImmediate(cb, 'Account not found');
				}

				if (account.delegates) {
					modules.delegates.getDelegates(req.body, function (err, res) {
						var delegates = res.delegates.filter(function (delegate) {
							return account.delegates.indexOf(delegate.publicKey) !== -1;
						});

						return setImmediate(cb, null, { delegates: delegates });
					});
				} else {
					return setImmediate(cb, null, { delegates: [] });
				}
			});
		});
	},

	getDelegatesFee: function (req, cb) {
		return setImmediate(cb, null, { fee: constants.fees.delegate });
	},

	addDelegates: function (req, cb) {
		library.schema.validate(req.body, schema.addDelegates, function (err) {
			if (err) {
				return setImmediate(cb, err[0].message);
			}

			var hash = crypto.createHash('sha256').update(req.body.secret, 'utf8').digest();
			var keypair = library.ed.makeKeypair(hash);

			if (req.body.publicKey) {
				if (keypair.publicKey.toString('hex') !== req.body.publicKey) {
					return setImmediate(cb, 'Invalid passphrase');
				}
			}

			library.balancesSequence.add(function (cb) {
				if (req.body.multisigAccountPublicKey && req.body.multisigAccountPublicKey !== keypair.publicKey.toString('hex')) {
					modules.accounts.getAccount({ publicKey: req.body.multisigAccountPublicKey }, function (err, account) {
						if (err) {
							return setImmediate(cb, err);
						}

						if (!account || !account.publicKey) {
							return setImmediate(cb, 'Multisignature account not found');
						}

						if (!account.multisignatures || !account.multisignatures) {
							return setImmediate(cb, 'Account does not have multisignatures enabled');
						}

						if (account.multisignatures.indexOf(keypair.publicKey.toString('hex')) < 0) {
							return setImmediate(cb, 'Account does not belong to multisignature group');
						}

						modules.accounts.getAccount({ publicKey: keypair.publicKey }, function (err, requester) {
							if (err) {
								return setImmediate(cb, err);
							}

							if (account.totalFrozeAmount == 0) {
								return setImmediate(cb, 'No Stake available');
							}

							if (!requester || !requester.publicKey) {
								return setImmediate(cb, 'Requester not found');
							}

							if (requester.secondSignature && !req.body.secondSecret) {
								return setImmediate(cb, 'Missing requester second passphrase');
							}

							if (requester.publicKey === account.publicKey) {
								return setImmediate(cb, 'Invalid requester public key');
							}

							var secondKeypair = null;

							if (requester.secondSignature) {
								var secondHash = crypto.createHash('sha256').update(req.body.secondSecret, 'utf8').digest();
								secondKeypair = library.ed.makeKeypair(secondHash);
							}

							var transaction;

							try {
								transaction = library.logic.transaction.create({
									type: transactionTypes.VOTE,
									votes: req.body.delegates,
									sender: account,
									keypair: keypair,
									secondKeypair: secondKeypair,
									requester: keypair
								});
							} catch (e) {
								return setImmediate(cb, e.toString());
							}

							modules.transactions.receiveTransactions([transaction], true, cb);
						});
					});
				} else {
					self.setAccountAndGet({ publicKey: keypair.publicKey.toString('hex') }, function (err, account) {
						if (err) {
							return setImmediate(cb, err);
						}

						if (account.totalFrozeAmount == 0) {
							return setImmediate(cb, 'No Stake available');
						}

						if (!account || !account.publicKey) {
							return setImmediate(cb, 'Account not found');
						}

						if (account.secondSignature && !req.body.secondSecret) {
							return setImmediate(cb, 'Invalid second passphrase');
						}

						var secondKeypair = null;

						if (account.secondSignature) {
							var secondHash = crypto.createHash('sha256').update(req.body.secondSecret, 'utf8').digest();
							secondKeypair = library.ed.makeKeypair(secondHash);
						}

						var transaction;

						try {
							transaction = library.logic.transaction.create({
								type: transactionTypes.VOTE,
								votes: req.body.delegates,
								sender: account,
								keypair: keypair,
								secondKeypair: secondKeypair
							});
						} catch (e) {
							return setImmediate(cb, e.toString());
						}

						modules.transactions.receiveTransactions([transaction], true, cb);

					});
				}
			}, function (err, transaction) {
				if (err) {
					return setImmediate(cb, err);
				}

				library.logic.vote.updateAndCheckVote(
					{
						votes: req.body.delegates,
						senderId: transaction[0].senderId
					}
					, function (err) {
						if (err) {
							return setImmediate(cb, err);
						}
						return setImmediate(cb, null, { transaction: transaction[0] });
					});
			});
		});
	},

	getAccount: function (req, cb) {
		library.schema.validate(req.body, schema.getAccount, function (err) {
			if (err) {
				return setImmediate(cb, err[0].message);
			}

			if (!req.body.address && !req.body.publicKey) {
				return setImmediate(cb, 'Missing required property: address or publicKey');
			}

			// self.getAccount can accept publicKey as argument, but we also compare here
			// if account publicKey match address (when both are supplied)
			var address = req.body.publicKey ? self.generateAddressByPublicKey(req.body.publicKey) : req.body.address;
			if (req.body.address && req.body.publicKey && address !== req.body.address) {
				return setImmediate(cb, 'Account publicKey does not match address');
			}

			self.getAccount({ address: address }, function (err, account) {
				if (err) {
					return setImmediate(cb, err);
				}

				if (!account) {
					return setImmediate(cb, 'Account not found');
				}

				return setImmediate(cb, null, {
					account: {
						address: account.address,
						unconfirmedBalance: account.u_balance,
						balance: account.balance,
						publicKey: account.publicKey,
						unconfirmedSignature: account.u_secondSignature,
						secondSignature: account.secondSignature,
						secondPublicKey: account.secondPublicKey,
						multisignatures: account.multisignatures || [],
						u_multisignatures: account.u_multisignatures || [],
						totalFrozeAmount: account.totalFrozeAmount
					}
				});
			});
		});
	},

	totalAccounts: function (req, cb) {
		library.db.one(sql.getTotalAccount)
		.then(function (data) {
			return setImmediate(cb, null, data);
		})
		.catch(function (err) {
			library.logger.error(err.stack);
			return setImmediate(cb, err.toString());
		});
	},

	getCirculatingSupply: function (req, cb) {
		var initialUnmined = config.etpSupply.totalSupply - config.initialPrimined.total;
		var publicAddress = library.config.sender.address;

		library.db.one(sql.getCurrentUnmined, { address: publicAddress })
		.then(function (currentUnmined) {
			var circulatingSupply = config.initialPrimined.total + initialUnmined - currentUnmined.balance;

			cache.prototype.getJsonForKey("minedContributorsBalance", function (err, contributorsBalance) {
				var totalCirculatingSupply = parseInt(contributorsBalance) + circulatingSupply;

				return setImmediate(cb, null, {
					circulatingSupply: totalCirculatingSupply
				});
			});
		})
		.catch(function (err) {
			library.logger.error(err.stack);
			return setImmediate(cb, err.toString());
		});
	},
	totalSupply: function (req, cb) {
		var totalSupply = config.etpSupply.totalSupply;

		return setImmediate(cb, null, {
			totalSupply: totalSupply
		});

	},

	migrateData: function (req, cb) {

		try {
			var balance;
			if (req.body.data.balance_d == null) {
				balance = 0;
			} else {
				balance = parseFloat(req.body.data.balance_d) * 100000000;
			}
		} catch (err) {
			return setImmediate(cb, err.toString());
		}

		function getStakeOrderFromETPS() {
			return new Promise(function (resolve, reject) {
				library.db.query(sql.getETPSStakeOrders, {
					account_id: req.body.data.id
				})
				.then(function (orders) {
					resolve(orders);
				}).catch(function (err) {
					library.logger.error(err.stack);
					reject(new Error(err.stack));
				});
			});
		}

		function insertstakeOrder(order) {
			return new Promise(function (resolve, reject) {

				var date = new Date((slots.getTime()) * 1000);
				var milestone = 0;
				var endTime = 0;
				var nextVoteMilestone = (date.setMinutes(date.getMinutes() + constants.froze.vTime)) / 1000;

				library.db.none(sql.InsertStakeOrder, {
					account_id: req.body.data.id,
					startTime: (slots.getTime(order.insert_time)),
					insertTime: slots.getTime(),
					senderId: req.body.address,
					freezedAmount: order.cost * 100000000,
					rewardCount: order.month_count,
					status: 1,
					nextVoteMilestone: nextVoteMilestone
				})
				.then(function () {
					resolve();
				})
				.catch(function (err) {
					library.logger.error(err.stack);
					reject((new Error(err.stack)));
				});
			});
		}

		async function insertStakeOrdersInETP(orders) {

			try {
				for (var order in orders) {
					await insertstakeOrder(orders[order]);
				}
			} catch (err) {
				library.logger.error(err.stack);
				reject((new Error(err.stack)));
			}
		}

		function checkFrozeAmountsInStakeOrders() {
			return new Promise(function (resolve, reject) {

				library.db.one(sql.totalFrozeAmount, {
					account_id: (req.body.data.id).toString()
				})
				.then(function (totalFrozeAmount) {
					if (totalFrozeAmount) {
						resolve(totalFrozeAmount);
					} else {
						resolve(0);
					}

				}).catch(function (err) {
					library.logger.error(err.stack);
					reject(new Error(err.stack));
				});
			});
		}

		function updateMemAccountTable(totalFrozeAmount) {
			return new Promise(function (resolve, reject) {

				library.db.none(sql.updateUserInfo, {
					address: req.body.address,
					balance: parseInt(totalFrozeAmount.sum),
					email: req.body.data.email,
					phone: req.body.data.phone,
					username: req.body.data.username,
					country: req.body.data.country,
					totalFrozeAmount: parseInt(totalFrozeAmount.sum),
					group_bonus: req.body.group_bonus
				})
				.then(function () {
					resolve();
				})
				.catch(function (err) {
					library.logger.error(err.stack);
					reject(new Error(err.stack));
				});
			});
		}

		function updateETPSUserDetail() {
			return new Promise(function (resolve, reject) {
				var date = new Date((slots.getRealTime()));

				library.db.none(sql.updateETPSUserInfo, {
					userId: req.body.data.id,
					insertTime: date
				})
				.then(function () {
					resolve();
				})
				.catch(function (err) {
					library.logger.error(err.stack);
					reject(new Error(err.stack));
				});
			});
		}


		(async function () {
			try {
				var orders = await getStakeOrderFromETPS();
				await insertStakeOrdersInETP(orders);
				var totalFrozeAmount = await checkFrozeAmountsInStakeOrders();
				if (!totalFrozeAmount.sum) {
					totalFrozeAmount.sum = 0;
				}
				await updateMemAccountTable(totalFrozeAmount);
				await updateETPSUserDetail();

				return setImmediate(cb, null, { success: true, message: "Successfully migrated" });
			} catch (err) {
				library.logger.error(err.stack);
				return setImmediate(cb, err.toString());
			}
		})();
	},

	validateExistingUser: function (req, cb) {

		var data = req.body.data;
		var username = Buffer.from((data.split("&")[0]).split("=")[1], 'base64').toString();
		var password = Buffer.from((data.split("&")[1]).split("=")[1], 'base64').toString();

		var hashPassword = crypto.createHash('md5').update(password).digest('hex');

		library.db.one(sql.validateExistingUser, {
			username: username,
			password: hashPassword
		}
		).then(function (userInfo) {

			return setImmediate(cb, null, { success: true, userInfo: userInfo });

		}).catch(function (err) {
			library.logger.error(err.stack);
			return setImmediate(cb, "Invalid username or password");
		});

	},

	verifyUserToComment: function (req, cb) {
		if (!req.body.secret) {
			return setImmediate(cb, 'secret is missing');
		}
		var hash = crypto.createHash('sha256').update(req.body.secret, 'utf8').digest();
		var keypair = library.ed.makeKeypair(hash);
		var publicKey = keypair.publicKey.toString('hex');
		var address = self.generateAddressByPublicKey(publicKey);
		library.db.query(sql.findTrsUser, {
			senderId: address
		})
		.then(function (trs) {
			// send trs object if want all transations details for {address}
			return setImmediate(cb, null, { address: trs[0].senderId });
		})
		.catch(function (err) {
			return setImmediate(cb, err);
		})
	}
};

// Internal API
/**
 * @todo implement API comments with apidoc.
 * @see {@link http://apidocjs.com/}
 */
Accounts.prototype.internal = {
	count: function (req, cb) {
		return setImmediate(cb, null, { success: true, count: Object.keys(__private.accounts).length });
	},

	top: function (query, cb) {
		self.getAccounts({
			sort: {
				balance: -1
			},
			offset: query.offset,
			limit: (query.limit || 100)
		}, function (err, raw) {
			if (err) {
				return setImmediate(cb, err);
			}

			var accounts = raw.map(function (account) {
				return {
					address: account.address,
					balance: account.balance,
					publicKey: account.publicKey
				};
			});

			return setImmediate(cb, null, { success: true, accounts: accounts });
		});
	},

	getAllAccounts: function (req, cb) {
		return setImmediate(cb, null, { success: true, accounts: __private.accounts });
	},

	// lock account API
	lockAccount: function (req, cb) {
		library.schema.validate(req.body, schema.lockAccount, function (err) {
			if (!err) {
				if (!req.body.address) {
					return setImmediate(cb, 'Missing required property: address');
				}
				var address = req.body.publicKey ? self.generateAddressByPublicKey(req.body.publicKey) : req.body.address;
				self.getAccount({ address: address }, function (err, account) {
					if (err) {
						return setImmediate(cb, err);
					}
					if (!account) {
						let data = {};
						data.status = 0;
						data.address = req.body.address;
						if (req.body.accType) {
							data.acc_type = req.body.accType;
							var lastBlock = modules.blocks.lastBlock.get();
							//data.startTime = lastBlock.timestamp;
							data.endTime = library.logic.contract.calcEndTime(req.body.accType, lastBlock.timestamp);
							if (req.body.amount) {
								data.transferedAmount = req.body.amount;
							}
							var REDIS_KEY_USER_INFO_HASH = "userInfo_" + data.address;
							var REDIS_KEY_USER_TIME_HASH = "userTimeHash_" + data.endTime;
							cache.prototype.isExists(REDIS_KEY_USER_INFO_HASH, function (err, isExist) {
								if (!isExist) {
									var userInfo = {
										address: data.address,
										transferedAmount: data.transferedAmount,
										endTime: data.endTime,
										accType: req.body.accType
									};
									cache.prototype.hmset(REDIS_KEY_USER_INFO_HASH, userInfo);
									cache.prototype.hmset(REDIS_KEY_USER_TIME_HASH, userInfo);
									library.logic.contract.sendContractAmount([userInfo], function (err, res) {
										//FIXME: do further processing with "res" i.e send notification to the user
										if (err) {
											return setImmediate(cb, err);
										}
										library.logic.account.set(data.address, data, function (err) {
											if (!err) {
												data.startTime = lastBlock.timestamp;
												return setImmediate(cb, null, { account: data });
											} else {
												return setImmediate(cb, err);
											}
										});
									});
								} else {
									return setImmediate(cb, null, { account: data });
								}
							});
						}
					} else {
						library.db.one(sql.checkAccountStatus, {
							senderId: account.address
						})
						.then(function (row) {
							if (row.status == 0) {
								//return setImmediate(cb, 'Account is already locked');
								return cb('Account is already locked');
							}
							library.db.none(sql.disableAccount, {
								senderId: account.address
							})
							.then(function () {
								library.logger.info(account.address + ' account is locked');
								return setImmediate(cb, null, { account: account });
							})
							.catch(function (err) {
								library.logger.error(err.stack);
								return setImmediate(cb, err);
							});
							//return setImmediate(cb, null, row.status);
							//cb(null);
						})
						.catch(function (err) {
							library.logger.error(err.stack);
							return setImmediate(cb, 'Transaction#checkAccountStatus error');
						});
					}
				});
			} else {
				return setImmediate(cb, err);
			}
		});
	},

	// unlock account API
	unlockAccount: function (req, cb) {
		library.schema.validate(req.body, schema.unlockAccount, function (err) {
			if (!err) {
				if (!req.body.address) {
					return setImmediate(cb, 'Missing required property: address');
				}

				var address = req.body.publicKey ? self.generateAddressByPublicKey(req.body.publicKey) : req.body.address;
				library.db.none(sql.enableAccount, {
					senderId: address
				})
				.then(function () {
					library.logger.info(address + ' account is unlocked');
					return setImmediate(cb, null);
				})
				.catch(function (err) {
					return setImmediate(cb, err);
				});
			} else {
				return setImmediate(cb, err);
			}
		});
	},

	// logout API
	logout: function (req, cb) {
		delete req.decoded;
		return setImmediate(cb, null);
	},

	generateQRCode: function (req, cb) {
		var user = {};
		if (!req.body.publicKey) {
			return setImmediate(cb, 'Missing address or public key');
		}
		user.address = modules.accounts.generateAddressByPublicKey(req.body.publicKey);
		var secret = speakeasy.generateSecret({ length: 30 });
		QRCode.toDataURL(secret.otpauth_url, function (err, data_url) {
			user.twofactor = {
				secret: "",
				tempSecret: secret.base32,
				dataURL: data_url,
				otpURL: secret.otpauth_url
			};
			cache.prototype.isExists('2fa_user_' + user.address, function (err, isExist) {
				if (!isExist) {
					cache.prototype.hmset('2fa_user_' + user.address, JSON.stringify(user), 'ex', 30);
					return setImmediate(cb, null, { success: true, dataUrl: data_url });
				} else {
					cache.prototype.delHash('2fa_user_' + user.address, function (isdel) {
						cache.prototype.hmset('2fa_user_' + user.address, JSON.stringify(user), 'ex', 30);
						return setImmediate(cb, null, { success: true, dataUrl: data_url });
					});
				}
			});

		});
	},

	verifyOTP: function (req, cb) {
		var user = {};
		if (!req.body.publicKey) {
			return setImmediate(cb, 'Missing address or public key');
		}
		user.address = modules.accounts.generateAddressByPublicKey(req.body.publicKey);
		cache.prototype.hgetall('2fa_user_' + user.address, function (err, userCred) {
			if (!userCred) {
				return setImmediate(cb, 'Token expired or invalid OTP. Click resend to continue');
			}
			if (err) {
				return setImmediate(cb, err);
			}
			var user_2FA = JSON.parse(Object.keys(userCred));
			var verified = speakeasy.totp.verify({
				secret: user_2FA.twofactor.tempSecret,
				encoding: 'base32',
				token: req.body.otp,
				window: 6
			});
			if (!verified) {
				return setImmediate(cb, 'Invalid OTP!. Please enter valid OTP to SEND Transaction');
			}
			return setImmediate(cb, null, { success: true, key: user_2FA.twofactor.tempSecret });
		});
	},

	enableTwoFactor: function (req, cb) {
		var user = {};
		if (!req.body.key) {
			return setImmediate(cb, 'Key is missing');
		}
		if (!req.body.secret) {
			return setImmediate(cb, 'secret is missing');
		}
		if (!req.body.otp) {
			return setImmediate(cb, 'otp is missing');
		}
		var hash = crypto.createHash('sha256').update(req.body.secret, 'utf8').digest();
		var keypair = library.ed.makeKeypair(hash);
		var publicKey = keypair.publicKey.toString('hex');
		user.address = modules.accounts.generateAddressByPublicKey(publicKey);
		cache.prototype.hgetall('2fa_user_' + user.address, function (err, userCred) {
			if (err) {
				return setImmediate(cb, err);
			}
			if (!userCred) {
				return setImmediate(cb, 'Key expired');
			}
			var user_2FA = JSON.parse(Object.keys(userCred));
			var verified = speakeasy.totp.verify({
				secret: req.body.key,
				encoding: 'base32',
				token: req.body.otp,
				window: 6
			});
			if (!verified) {
				return setImmediate(cb, 'Invalid OTP!. Please enter valid OTP to SEND Transaction');
			}
			user_2FA.twofactor.secret = req.body.key;
			cache.prototype.hmset('2fa_user_s' + user.address, user_2FA);
			return setImmediate(cb, null, { success: true, key: user_2FA.twofactor.tempSecret });
		});
	},

	disableTwoFactor: function (req, cb) {
		var user = {};
		if (!req.body.publicKey) {
			return setImmediate(cb, 'Missing address or public key');
		}
		user.address = modules.accounts.generateAddressByPublicKey(req.body.publicKey);
		cache.prototype.isExists('2fa_user_' + user.address, function (err, isExist) {
			if (isExist) {
				cache.prototype.delHash('2fa_user_' + user.address);
			}
			return setImmediate(cb, null, { success: true, message: "Two Factor Authentication Disabled For " + user.address });
		});
	},

	checkTwoFactorStatus: function (req, cb) {
		var user = {};
		if (!req.body.publicKey) {
			return setImmediate(cb, 'Missing address or public key');
		}
		user.address = modules.accounts.generateAddressByPublicKey(req.body.publicKey);
		cache.prototype.isExists('2fa_user_' + user.address, function (err, isExist) {
			if (isExist) {
				return setImmediate(cb, null, { success: true });
			}
			return setImmediate(cb, null, { success: false });
		});
	},

	// Get user's status before sending pending group bonus 
	getWithdrawlStatus: function (req, cb) {
		library.schema.validate(req.body, schema.enablePendingGroupBonus, function (err) {
			if (err) {
				return setImmediate(cb, err);
			}

			let stakedAmount = 0, groupBonus = 0, pendingGroupBonus = 0, failedRule = 0;
			async.series({
				checkLastWithdrawl: function (seriesCb) {
					library.cache.client.exists(req.body.address + '_pending_group_bonus_trs_id', function (err, isExists) {
						if (isExists) {
							library.cache.client.get(req.body.address + '_pending_group_bonus_trs_id', function (err, transactionId) {
								if (err) {
									failedRule = 1;
									seriesCb(err);
								}
								library.db.one(sql.findTrs, {
									transactionId: transactionId
								})
								.then(function (transationData) {
									var d = constants.epochTime;
									var t = parseInt(d.getTime() / 1000);
									var d = new Date((transationData.timestamp + t) * 1000);
									const timeDiff = (d - Date.now());
									const days = Math.ceil(Math.abs(timeDiff / (1000 * 60 * 60 * 24)));
									if (days > 7) {
										seriesCb(null);
									} else {
										failedRule = 1;
										seriesCb('This week\'s withdrawl is already processed. You can try next withdrawl after ' + 7 - days + ' days.')
									}
								})
								.catch(function (err) {
									failedRule = 1;
									seriesCb(err);
								});
							});
						} else {
							seriesCb(null);
						}
					});
				},
				checkActiveStake: function (seriesCb) {
					library.db.query(sql.findActiveStake, {
						senderId: req.body.address
					})
					.then(function (stakeOrders) {
						if (stakeOrders.length > 0) {
							seriesCb(null);
						} else {
							failedRule = 2;
							seriesCb('Rule 2 failed: You need to have at least one active stake order');
						}
					})
					.catch(function (err) {
						failedRule = 2;
						seriesCb(err);
					});
				},
				checkActiveStakeOfLeftAndRightSponsor: function (seriesCb) {
					library.db.query(sql.findDirectSponsor, {
						introducer: req.body.address
					})
					.then(function (directSponsors) {
						if (directSponsors.length >= 2) {

							//check at least two active stake orders
							let activeStakeCount = 0;
							directSponsors.forEach(function (directSponsor, index) {
								library.db.query(sql.findActiveStakeAmount, {
									senderId: directSponsor[index].address
								})
								.then(function (stakeInfo) {
									stakedAmount = parseInt(stakeInfo[0].sum) / 100000000;
									var d = constants.epochTime;
									var t = parseInt(d.getTime() / 1000);
									var d = new Date((stakeInfo[0].startTime + t) * 1000);
									const timeDiff = (d - Date.now());
									const days = Math.ceil(Math.abs(timeDiff / (1000 * 60 * 60 * 24)));
									if (stakedAmount && days <= 31) {
										activeStakeCount++;
									}
								})
								.catch(function (err) {
									failedRule = 3;
									seriesCb(err);
								});
							});
							if (activeStakeCount >= 2) {
								seriesCb(null);
							} else {
								failedRule = 3;
								seriesCb('Rule 3 failed: Direct sponsors don\'t have active stake orders');
							}
						} else {
							failedRule = 3;
							seriesCb('Rule 3 failed: User doesn\'t have two direct sponsor')
						}
					})
					.catch(function (err) {
						failedRule = 3;
						seriesCb(err);
					})
				},
				checkRatio: function (seriesCb) {

					// check ratio 1:10 to qualify for enabling token distribution
					library.db.query(sql.findGroupBonus, {
						senderId: req.body.address
					})
					.then(function (groupBonus) {
						groupBonus = groupBonus[0].group_bonus;
						pendingGroupBonus = groupBonus[0].pending_group_bonus;
						if (pendingGroupBonus < groupBonus) {
							nextBonus = (groupBonus - pendingGroupBonus) > 15 ? 15 : (groupBonus - pendingGroupBonus);
							if ((groupBonus - pendingGroupBonus + nextBonus) < stakedAmount * 10) {
								pendingGroupBonus = pendingGroupBonus + nextBonus;
								seriesCb(null)
							} else {
								failedRule = 4;
								seriesCb('Rule 4 failed: Ratio withdrawal is 1:10 from own staking DDK.');
							}
						} else {
							failedRule = 4;
							seriesCb('Either you don\'t have group bonus reserved or exhausted your withdrawl limit');
						}
					})
					.catch(function (err) {
						failedRule = 4;
						seriesCb(err);
					});
				}
			}, function (err) {
				if (err) {
					return setImmediate(cb, { message: err, code: failedRule });
				}
				return setImmediate(cb, null);
			});
		});
	},

	// Send withdrawl amount to respective address
	sendWithdrawlAmount: function (req, cb) {
		library.schema.validate(req.body, schema.enablePendingGroupBonus, function (err) {
			if (err) {
				return setImmediate(cb, err);
			}
			if (!nextBonus) {
				return setImmediate(cb, 'You don\'t have pending group bonus remaining');
			}
			let userInfo = {
				address: req.body.address,
				transferedAmount: nextBonus,
				accType: 5
			};
			//Send amount through smart contract
			library.logic.contract.sendContractAmount([userInfo], function (err, trsResponse) {
				if (err) {
					return setImmediate(cb, err);
				}
				library.cache.client.set(req.body.address + '_pending_group_bonus_trs_id', trsResponse.transactionId);
				library.db.none(sql.updatePendingGroupBonus, {
					nextBonus: nextBonus,
					address: req.body.address
				})
				.then(function () {
					return setImmediate(cb, null);
				})
				.catch(function (err) {
					return setImmediate(cb, err);
				});
			});
		});
	}
};

// Export
module.exports = Accounts;
