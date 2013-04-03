# 100% JavaScript implementation of Web SQL API
Pure-JS-WebSQL is an implementation of [Web SQL Database API](http://www.w3.org/TR/webdatabase/) in pure JavaScript.  
The implementation provides a glue between Web SQL Database API and [SQL.js](https://github.com/kripken/sql.js) (SQLite port to JavaScript). The data between sessions is stored in the `localStorage`.

## Demo
[Pure-JS-WebSQL Demo](http://htmlpreview.github.com/?https://github.com/yradtsevich/pure-js-websql/blob/master/test/index.html). It should work in any Gecko- or WebKit-based browser.

## Usage

```html
<html>
<head>
   <script src='https://raw.github.com/kripken/sql.js/master/js/sql.js'></script>
   <script src='https://raw.github.com/yradtsevich/pure-js-websql/master/js/purejswebsql.js'></script>
   <script>
      openDatabase = purejsOpenDatabase;

      // now you may use Web SQL API as if it is supported by your browser:
      var db = openDatabase('mydb', '1.0', 'my first database', 2 * 1024 * 1024);
      db.transaction(function (tx) {
	     tx.executeSql('DROP TABLE IF EXISTS foo');
         tx.executeSql('CREATE TABLE IF NOT EXISTS foo (id unique, text)');
         tx.executeSql('INSERT INTO foo (id, text) VALUES (?, ?)', [1, 'synergies']);
         tx.executeSql('SELECT * from foo', [], function(tx, result) {
            alert('id = ' + result.rows.item(0).id + ', text = ' + result.rows.item(0).text)
         });
      });
   </script>
</head>
<html>
```
## License
Pure-JS-WebSQL is released under the [MIT license](http://opensource.org/licenses/MIT).
