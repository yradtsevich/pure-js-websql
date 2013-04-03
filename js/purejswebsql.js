/*!
 * Pure-JS-WebSQL JavaScript Library
 *
 * Copyright 2013 Red Hat, Inc.
 * Released under the MIT license
 * http://opensource.org/licenses/MIT
 *
 * Author: Yahor Radtsevich
 */
(function(window) {

var DOMEx = function(name, code, description) {
	this.message = name + ': DOM Exception ' + code;
	this.name = name;
	this.code = code;
	this.stack = (new Error(description)).stack;
};
DOMEx.prototype = DOMException.prototype;
DOMEx.__proto__ = DOMException.prototype;
DOMEx.prototype.constructor = DOMEx;

var SQLEr = function(message, code) {
	this.message = message;
	this.code = code;
	this.stack = (new Error(message)).stack;
}
if (window.SQLException) {
	SQLEr.prototype = SQLException.prototype;
	SQLEr.__proto__ = SQLException.prototype;
}
SQLEr.prototype.constructor = SQLEr;

SQLEr.prototype.toString = DOMEx.prototype.toString = function() {
	return 'Error: ' + this.message;
}

function asyncExec(f) {
	setTimeout(f, 0);
}

function mysql_real_escape_string(str) { //http://stackoverflow.com/questions/7744912/making-a-javascript-string-sql-friendly
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char; // prepends a backslash to backslash, percent,
                                  // and double/single quotes
        }
    });
}

function throwTypeMismatchErrorIfStringOrNumber(value) {
	if (typeof(value) === 'string' || typeof(value) === 'number') {
		throw new DOMEx('TypeMismatchError', 17 /*DOMException.TYPE_MISMATCH_ERR*/, 'The type of an object was incompatible with the expected type of the parameter associated to the object.');
	}
}

function convertType(val) {
	if (val === 'true') {
		return true;
	}
	if (val === 'false') {
		return false;
	}
	if (val === 'null') {
		return null;
	}
	if (isFinite(val)) {
		var n = parseFloat(val);
		if (!isNaN(n)) {
			return n;
		}
	}
	return val;
}
	

function sqlEscape(value) {
	return mysql_real_escape_string(String(value));
}
function replaceValues(statement, values) {
	for (var i = 0; i < values.length; i++) {
		statement = statement.replace('?', "'" + sqlEscape(values[i]) + "'"); //TODO: skip escaped question mark
	}
	return statement;
}

var dbMap = {}; //XXX: memory leaks here if there are multiple databases - need a week reference
window.addEventListener('unload', function() {
	for (var name in dbMap) {
		var data = dbMap[name].db.exportData();
		localStorage['_db_data_' + name] = String.fromCharCode.apply(null, data);
		localStorage['_db_version_' + name] = JSON.stringify(dbMap[name].version);
	}
});

var purejsOpenDatabase = function(name, version, displayName, estimatedSize, creationCallback) {
	var Database = function(name, _db) {
		this._name = name;
		this._db = _db;
	};
	var databaseTransaction = function(callback, errorCallback, successCallback) {
		var that = this;
		asyncExec(function() {
			that._db.exec('BEGIN TRANSACTION;');
			
			var Transaction = function() {
				this._db = that._db;
				this._executeSqlQueue = [];
			};
			Transaction.prototype.executeSql = function(sqlStatement, values, callback, errorCallback) {
				if (arguments.length === 0) {
					throw new DOMEx('SyntaxError', 12 /*DOMException.SYNTAX_ERR*/, 'An invalid or illegal string was specified.');
				}
				throwTypeMismatchErrorIfStringOrNumber(values);
				throwTypeMismatchErrorIfStringOrNumber(callback);
				throwTypeMismatchErrorIfStringOrNumber(errorCallback);
								
				values = values || [];
				sqlStatement = String(sqlStatement);
				this._executeSqlQueue.push({
					sql : replaceValues(sqlStatement, values),
					callback : callback,
					errorCallback : errorCallback
				});				
			};
			var tx = new Transaction();
			callback(tx);
			
			var success = true;
			try {
				for (var k = 0; k < tx._executeSqlQueue.length; k++) {
					var executeSqlEntry = tx._executeSqlQueue[k];
					
					var rows = new Array();
					rows.item = function(i) {return this[i]};
					
					var data = null;
					var rowsAffected;
					var insertId = null;
					try {
						var previousTotalChanges = that._db.totalChanges;
						
						data = that._db.exec(executeSqlEntry.sql);
						
						var lastInfo = that._db.exec('SELECT total_changes(), last_insert_rowid()');
						that._db.totalChanges = lastInfo[0][0].value;
						rowsAffected = that._db.totalChanges - previousTotalChanges;
						if (rowsAffected > 0) {// XXX: works wrong when DELETE executed
							insertId = lastInfo[0][1].value | 0;
						}
					} catch (e) {
						if (typeof(e)==='string') {
							e = new SQLEr(e, SQLException.SYNTAX_ERR);
						}
						if (typeof(executeSqlEntry.errorCallback) === "function") {
							var noSuccess = false;
							try {
								noSuccess = executeSqlEntry.errorCallback(tx, e);
							} catch (e) {
								noSuccess = true;
							}
							if (noSuccess) {
								throw new SQLEr('the statement callback raised an exception or statement error callback did not return false', SQLException.UNKNOWN_ERR);
							}
						} else {
							throw e;
						}
					}
					
					if (data != null) {
						for (var i = 0; i < data.length; i++) {
							var row = {};
							for (var j = 0; j < data[i].length; j++) {
								row[ data[i][j].column ] = convertType(data[i][j].value); // XXX: now converts to the most suitable type, but the type is specified in db
							}
							rows[i] = row;
						}

						if (typeof(executeSqlEntry.callback) === "function") {
							var resultSet = {
								get insertId() {
									if (insertId !== null) {
										return insertId;
									} else {
										throw new DOMEx('InvalidAccessError', 15 /*DOMException.INVALID_ACCESS_ERR*/, 'A parameter or an operation was not supported by the underlying object.');
									}
								},
								rowsAffected : rowsAffected,
								rows : rows
							};
							executeSqlEntry.callback(tx, resultSet);
						}
					}
				}
			} catch (e) {
				success = false;
				that._db.exec('ROLLBACK;');
				if (typeof(errorCallback) === "function") {
					errorCallback(e);
				}
			}

			if (success) {
				that._db.exec('COMMIT;');
				if (typeof(successCallback) === "function") {
					asyncExec(successCallback);
				}
			}
		});
	};
	Database.prototype = {
		transaction : databaseTransaction,
		readTransaction : databaseTransaction, // XXX - probably need to remove BEGIN TRANSACTION/COMMIT for this implementation
		get version() {
			return dbMap[this._name].version;
		},
		set version(ver) {// changeVersion() must be used
		},
		changeVersion : function(oldVersion, newVersion, callback, errorCallback, successCallback) {
			if (oldVersion != this.version) {
				if (errorCallback) {
					asyncExec(function() {
						errorCallback(new SQLEr('current version of the database and `oldVersion` argument do not match', SQLException.VERSION_ERR));
					});
				}
			} else {
				dbMap[this._name].version = newVersion;
				if (callback) {
					this.transaction(callback, errorCallback, successCallback);
				} else if (successCallback) {
					successCallback();
				}
			}
		}
	};

	var _db;
	var created;
	if (dbMap[name]) {
		_db = dbMap[name].db;
		var storedVersion = dbMap[name].version;
		
		if (version !== '' && storedVersion != version) {
			throw new DOMEx('InvalidStateError', 11 /*DOMException.INVALID_STATE_ERR*/, 'An attempt was made to use an object that is not, or is no longer, usable.');
		}
		created = false;
	} else if (localStorage['_db_data_' + name]) {
		var data = localStorage['_db_data_' + name].split('').map(function(c) {return c.charCodeAt(0);});
		_db = SQL.open(data);
		var storedVersion = JSON.parse(localStorage['_db_version_' + name]);
		
		if (version !== '' && storedVersion != version) {
			throw new DOMEx('InvalidStateError', 11 /*DOMException.INVALID_STATE_ERR*/, 'An attempt was made to use an object that is not, or is no longer, usable.');
		}
		created = false;
	} else {
		_db = SQL.open();
		created = true;
	}

	_db.totalChanges = _db.totalChanges | 0;
	var database = new Database(name, _db);
	dbMap[name] = {db : _db};

	if (created) {
		dbMap[name].version = '';
		if (creationCallback) {
			asyncExec(function() {
				creationCallback(database);
			});
		} else {
			dbMap[name].version = version;
		}
	} else {
		dbMap[name].version = storedVersion;
	}

	return database;
}

window.purejsOpenDatabase = purejsOpenDatabase;

})(window);
