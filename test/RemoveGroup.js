const yargs = require('yargs')
const chalk = require('chalk')
const mysql = require('mysql')

let {argv} = yargs

//使用node RemoveGroup.js chatId
async function start(chatId) {
  let connection = mysql.createConnection({
    host: '192.144.200.234',
    user: 'hfs',
    password: 'EO:hR>lHu3Dqaa',
    database: 'LK_S',
    port: 3306,
    multipleStatements: true
  })
  connection.connect()
  let arr = [
    'DELETE from groupMember where gid = ?;',
    'DELETE from groupChat where id = ?;'
  ]
  connection.query('select id from groupChat where name=?', [chatId], (error, data) => {
    if (error) { throw error }
    if (data[0]) {
      const sql = arr.join('')
      connection.query(sql, [data[0].id, data[0].id], (error) => {
        if (error) { throw error }
        console.log(chalk.green('successfully'))
      })
    } else {
      console.log(chalk.red('群不存在!'))
    }
    connection.end()
  })
}

if (argv._.length > 0) {
  start(argv._[0])
} else {
  console.log(chalk.red('请输入群名称'))
}
