import { ethers } from 'ethers'
import bn from 'bignumber.js'
import fs from 'fs-extra'
import { ReceiptFail } from './constant.js'

const SevenDaySeconds = 7 * 24 * 3600
const { rpc, poolAddress, mudAddress, delaneyAddress, signerPrivateKey, adminAddressList } = fs.readJSONSync('config.json')
const signerWallet = new ethers.Wallet(signerPrivateKey)
// mud '0xf6EaC236757e82D6772E8bD02D36a0c791d78C51'
// usdt '0x5338968f9646e4a865d76e07c2a6e340dd3ac462'
// 'https://polygon.drpc.org'
// 'https://polygon-mainnet.nodereal.io/v1/c6a4d008708642b097e1d7c9372a3b67'
// 'https://omniscient-floral-wish.matic.quiknode.pro/c8744f4ef0f1f40210d5d68ac6170281c379b088'
// 'http://127.0.0.1:8545'
export { delaneyAddress, signerPrivateKey, rpc, mudAddress, adminAddressList }
export const provider = new ethers.JsonRpcProvider(rpc, undefined, { polling: true }) // https://github.com/ethers-io/ethers.js/issues/4104#issuecomment-1694486121
export const delaneyAbi = fs.readJSONSync('./utils/delaney.json')
export const delaney = new ethers.Contract(delaneyAddress, delaneyAbi, provider)
export const signerAddress = signerWallet.address.toLowerCase()

// 产生邀请码
export const randRef = (len = 6) => {
  const characters = '0123456789'
  let ref = ''
  for (let i = 0; i < len; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length)
    ref += characters.charAt(randomIndex)
  }

  return ref
}

// 获取mud的价格
const getPrice = (sqrtPriceX96, decimal0, decimal1) => {
  sqrtPriceX96 = bn(sqrtPriceX96)
  decimal0 = bn(decimal0)
  decimal1 = bn(decimal1)

  const buyOneOfToken0 = sqrtPriceX96
    .div(bn(2).pow(96))
    .pow(2)
    .div(bn(10).pow(decimal1.toNumber()).div(bn(10).pow(decimal0.toNumber())))
  const buyOneOfToken1 = bn(1).div(buyOneOfToken0)

  const fee = 0.994
  const buyUsdt = parseFloat(parseFloat(buyOneOfToken0.toFixed(6) * fee).toFixed(6))
  const buyMud = parseFloat(parseFloat(buyOneOfToken1.toFixed(6) * fee).toFixed(6))
  const buyUsdtWei = buyUsdt * 10 ** parseInt(decimal0)
  const buyMudWei = buyMud * 10 ** parseInt(decimal1)
  const price = {
    buy_usdt: buyUsdt,
    buy_mud: buyMud,
    buy_usdt_wei: buyUsdtWei,
    buy_mud_wei: buyMudWei
  }
  return price
}

export const mudPrice = async (blockTag) => {
  const poolAbi = [
    {
      inputs: [],
      name: 'slot0',
      outputs: [
        { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
        { internalType: 'int24', name: 'tick', type: 'int24' },
        { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
        { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
        { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
        { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
        { internalType: 'bool', name: 'unlocked', type: 'bool' }
      ],
      stateMutability: 'view',
      type: 'function'
    }
  ]

  const poolContract = new ethers.Contract(poolAddress, poolAbi, provider)
  const slot0 = await poolContract.slot0({ blockTag })
  const decimal0 = '6' // MUD小数点
  const decimal1 = '6' // USDT小数点
  const price = getPrice(slot0.sqrtPriceX96.toString(), decimal0, decimal1)

  const block = await provider.getBlock(blockTag, false)

  return {
    ...price,
    timestamp: block.timestamp,
    number: block.number,
    hash: block.hash,
    time: new Date(block.timestamp * 1000).toISOString(),
    sqrt_price_x96: slot0.sqrtPriceX96.toString()
  }
}

export const pageSql = (table, page, page_size, sort_field, sort_order, filters) => {
  let sql_base = `SELECT * FROM ${table}`
  if (filters) {
    let conditions = []
    Object.keys(filters).forEach((key) => {
      conditions.push(`${key} ${filters[key]}`)
    })

    if (conditions.length > 0) {
      sql_base += ` WHERE ${conditions.join(' AND ')}`
    }
  }

  const sql_count = sql_base.replace('*', 'COUNT(*) total')

  if (sort_field && sort_order) {
    sql_base += ` ORDER BY ${sort_field} ${sort_order}`
  }
  sql_base += ` LIMIT ${page_size} OFFSET ${(page - 1) * page_size}`
  return { sql_count, sql_base }
}

export const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const now = () => {
  return parseInt(new Date().getTime() / 1000)
}

export const getConfigs = async () => {
  const configs = await delaney.getConfigs()
  const keys = [
    'period_duration',
    'period_num',
    'period_reward_ratio',
    'person_reward_level1',
    'person_reward_level2',
    'person_reward_level3',
    'person_reward_level4',
    'person_reward_level5',
    'team_reward_level1',
    'team_reward_level2',
    'team_reward_level3',
    'team_reward_level4',
    'team_reward_level5',
    'preson_invest_min_usdt',
    'preson_reward_min_usdt',
    'team_reward_min_usdt',
    'fee',
    'claim_min_usdt',
    'team_level1_sub_usdt',
    'team_level1_team_usdt'
  ]
  const config = {}
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    config[key] = parseInt(configs[i])
  }
  return config
}

export const afterSeconds = (seconds) => {
  return parseInt((new Date().getTime() / 1000).toString()) + seconds
}

// https://1.x.wagmi.sh/examples/sign-message
export const recoverAddress = (signature, message) => {
  const hash = ethers.hashMessage(message)
  const signer = ethers.recoverAddress(hash, signature)
  return signer
}

export const humanReadable = (value, precision = 1000000n) => {
  value = BigInt(value)
  precision = precision || 1000000n
  const result = ((value * 100n) / precision).toString() // 将结果扩大100倍以保留两位小数
  const integerPart = result.slice(0, -2) || '0' // 获取整数部分
  const decimalPart = result.slice(-2) // 获取小数部分

  return decimalPart === '00' ? integerPart : `${integerPart}.${decimalPart}`
}

export const authorizationCheck = (value, users) => {
  if (!value) {
    return { pass: false, err: 'authorization value is not exist' }
  }
  const [message, signature] = value.split(' ')
  if (!message || !signature) {
    return { pass: false, err: 'sign data timestamp or signature is not exist' }
  }

  if (!(typeof signature === 'string' && signature.length === 132)) {
    return { pass: false, err: 'signature is wrong' }
  }

  if (Number.isInteger(Number(message)) && message.length == 10) {
    if (parseInt(message + SevenDaySeconds) < afterSeconds(0)) {
      return { pass: false, err: 'signature is expire' }
    }
    const hash = ethers.hashMessage(message)
    const signer = ethers.recoverAddress(hash, signature)
    console.log('recover address', signer)
    for (const user of users) {
      if (signer.toLowerCase() == user.toLowerCase()) {
        return { pass: true, err: '', address: signer }
      }
    }
    return { pass: false, err: 'address is not allow' }
  } else {
    return Promise.reject('sign data timestamp value is not number')
  }
}
