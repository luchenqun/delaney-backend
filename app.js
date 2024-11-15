import path from 'path'
import AutoLoad from '@fastify/autoload'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const _initDatabase = (path) => {
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __dbPath = path.join(__dirname, 'db.sqlite')

// Pass --options via CLI arguments in command to enable these options.
export const options = {}

const fastifyOpts = {
  logger: true,
  class: Database,
  pathToDb: __dbPath
}

export default async function (fastify, opts) {
  // Place here your custom code!
  opts = Object.assign(fastifyOpts, opts)

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    options: Object.assign({}, opts)
  })

  // This loads all plugins defined in routes
  // define your routes in one of these
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, 'routes'),
    options: Object.assign({}, opts)
  })

  fastify.ready().then(
    () => {
      _initDatabase(__dbPath)
      console.log('successfully booted!')
    },
    (err) => {
      console.log('an error happened', err)
    }
  )
}
