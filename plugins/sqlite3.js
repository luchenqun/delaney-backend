import fp from 'fastify-plugin'
import Database from 'better-sqlite3'

const _createDbConnection = (Database, options) => {
  // If path to db exists, use that else create a db in memory
  const file = options.pathToDb ? options.pathToDb : ':memory:'

  const betterSqlite3Opts = options.betterSqlite3Opts || {}
  return new Database(file, betterSqlite3Opts)
}

const fastifyBetterSqlite3 = (fastify, opts, next) => {
  console.log('fastify options', opts)
  let db

  if (opts.class) {
    const DatabaseImported = opts.class
    // options has a ready made db connection, so use it if it is valid
    if (opts.connection && opts.connection instanceof DatabaseImported) {
      db = opts.connection
    } else {
      db = _createDbConnection(DatabaseImported, opts)
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
