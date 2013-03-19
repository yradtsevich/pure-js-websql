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
function sqlEscape(value) {
	return mysql_real_escape_string(String(value));
}
function replaceValues(statement, values) {
	if (values) {
		for (var i = 0; i < values.length; i++) {
			statement = statement.replace('?', "'" + sqlEscape(values[i]) + "'"); //TODO: skip escaped question mark
		}
	}
	return statement;
}
openDatabase = function(name, version, displayName, estimatedSize, creationCallback) {
	var Database = function(version) {
		this.version = version;
		this._db = SQL.open();
	};
	var databaseTransaction = function(callback, errorCallback, successCallback) {
		var that = this;
		setTimeout(function() {
			that._db.exec('BEGIN TRANSACTION;');
			
			var Transaction = function() {
				this._db = that._db;
			};
			Transaction.prototype.executeSql = function(sqlStatement, values, callback, errorCallback) {
				var data = this._db.exec(replaceValues(sqlStatement, values));
				
				var rows = new Array();
				rows.item = function(i) {return this[i]};
				
				for (var i = 0; i < data.length; i++) {
					var row = {};
					for (var j = 0; j < data[i].length; j++) {
						row[ data[i][j].column ] = data[i][j].value;
					}
					rows[i] = row;
				}
				
				var resultSet = {
					insertId : 0, // TODO
					rowsAffected : 0, // TODO
					rows : rows
				};
				callback && callback(this, resultSet);
			};
			var tx = new Transaction();
			callback(tx);

			that._db.exec('COMMIT;');

			successCallback && successCallback();
		}, 0);
	};
	Database.prototype = {
		transaction : databaseTransaction,
		readTransaction : databaseTransaction, // XXX
		changeVersion : function(oldVersion, newVersion, callback, errorCallback, successCallback) {
			// TODO
		}
	};

	var database = new Database(version);
	creationCallback && creationCallback(database);
	return database;
}
