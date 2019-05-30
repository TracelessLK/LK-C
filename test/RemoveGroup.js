const yargs = require('yargs')
const chalk = require('chalk')
const mysql = require('mysql')

let {argv} = yargs

//使用node RemoveGroup.js chatId
async function start(chatId) {
  let connection = await mysql.createConnection({
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
  const sql = arr.join('')
  await connection.query(sql, [chatId, chatId], (error) => {
    if (error) { throw error }
    console.log(chalk.green('successfully'))
  })
  connection.end()
}

if (argv._.length > 0) {
  start(argv._[0])
} else {
  console.log(chalk.red('请输入:chatId'))
}
