import fp from 'fastify-plugin'
import Database from 'better-sqlite3'

const _init = (path) => {
  const db = new Database(path)

  let stm = 'CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, txt TEXT)'
  db.prepare(stm).run()

  stm = 'SELECT Count(*) AS num FROM t'
  const { num } = db.prepare(stm).get()

  if (!num) {
    stm = db.prepare('INSERT INTO t (txt) VALUES (?)')
    for (let i = 0; i < 100; i++) {
      stm.run(Math.random().toString(36).slice(2))
    }
  }
}

const _createDbConnection = (Database, options) => {
  //
  // If path to db exists, use that else create a db in memory
  //
  const file = options.pathToDb ? options.pathToDb : ':memory:'

  if (options.pathToDb) {
    _init(options.pathToDb)
  }

  const betterSqlite3Opts = options.betterSqlite3Opts || {}
  return new Database(file, betterSqlite3Opts)
}

const fastifyBetterSqlite3 = (fastify, opts, next) => {
  console.log('fastify options', opts)
  let db

  if (opts.class) {
    const Database_imported = opts.class
    // options has a ready made db connection, so use it if it is valid
    if (opts.connection && opts.connection instanceof Database_imported) {
      db = opts.connection
    } else {
      db = _createDbConnection(Database_imported, opts)
    }
  } else {
    // create a new db connection using the inline Database class and the options passed in
    db = _createDbConnection(Database, opts)
  }

  if (fastify.betterSqlite3) {
    next(new Error('plugin already registered'))
  }

  fastify.decorate('db', db)
  fastify.addHook('onClose', (fastify, done) => db.close(done))

  next()
}

export default fp(fastifyBetterSqlite3, {
  fastify: '5.x',
  name: 'fastify-better-sqlite3'
})
