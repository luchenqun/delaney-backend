import path from 'path'
import AutoLoad from '@fastify/autoload'
import { fileURLToPath } from 'url'
import { fastifySchedulePlugin } from '@fastify/schedule'
import { SimpleIntervalJob, AsyncTask } from 'toad-scheduler'
import Database from 'better-sqlite3'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __dbPath = path.join(__dirname, 'db/db.sqlite')
const __dbCreateTablePath = path.join(__dirname, 'db/delaney.sql')

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
  fastify.register(fastifySchedulePlugin)

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

  const task = new AsyncTask(
    'simple task',
    async (taskId, jobId) => {
      // const { num } = fastify.db.prepare(`SELECT Count(*) AS num FROM t`).get()
      // console.log('simple task run', taskId, jobId, num)
    },
    (err) => {}
  )
  const job = new SimpleIntervalJob({ seconds: 30 }, task)

  fastify.ready().then(
    () => {
      // create table  init
      const sqliteCreateTableFile = fs.readFileSync(__dbCreateTablePath, 'utf8')
      const db = new Database(__dbPath, { verbose: console.log })
      db.exec(sqliteCreateTableFile)

      fastify.scheduler.addSimpleIntervalJob(job)
      console.log('successfully booted!')
    },
    (err) => {
      console.log('an error happened', err)
    }
  )
}
