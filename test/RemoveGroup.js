#!/usr/bin/env node
const yargs = require('yargs')
const chalk = require('chalk')
const mysql = require('mysql')
const _ = require('lodash')
const fs = require('fs')
const path = require('path')

let {argv} = yargs
const config = {
  host: '192.144.200.234',
  user: '',
  password: '',
  database: '',
  port: 3306,
  multipleStatements: true
}
//使用node RemoveGroup.js name
async function start(chatId) {
  let connection = mysql.createConnection(config)
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
const unversionedPath = path.resolve(__dirname, '../config/unversioned.js')
if (fs.existsSync(unversionedPath)) {
  _.merge(config, require(unversionedPath))
}
if (argv._.length > 0) {
  start(argv._[0])
} else {
  console.log(chalk.red('请输入群名称'))
}
