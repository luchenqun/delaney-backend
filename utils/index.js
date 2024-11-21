import { ethers } from 'ethers'
import bn from 'bignumber.js'

// 'https://polygon.drpc.org'
// 'https://polygon-mainnet.nodereal.io/v1/c6a4d008708642b097e1d7c9372a3b67'
// 'https://omniscient-floral-wish.matic.quiknode.pro/c8744f4ef0f1f40210d5d68ac6170281c379b088'
// 'http://127.0.0.1:8545'
export const rpc = 'http://127.0.0.1:8545'
export const provider = new ethers.JsonRpcProvider(rpc)
export const poolAddress = '0x546bc6E008689577C69C42b9C1f6b4C923f59B5d' // '0x5338968f9646e4a865d76e07c2a6e340dd3ac462'
export const mudAddress = '0xDad56A6B5eed8567Fc4395d05b59D15077c2c888' // '0xf6EaC236757e82D6772E8bD02D36a0c791d78C51'
export const delaneyAddress = '0x33Add53fb1CDeF4A10BeE7249b66a685200DDd2f'
export const delaneyAbi = JSON.parse(
  `[{"inputs":[{"internalType":"address","name":"initialOwner","type":"address"},{"internalType":"address","name":"initalSignerAddress","type":"address"},{"internalType":"address","name":"initalPoolAddress","type":"address"},{"internalType":"address","name":"initalMudAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"EnforcedPause","type":"error"},{"inputs":[],"name":"ExpectedPause","type":"error"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":false,"internalType":"uint256","name":"usdt","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"mud","type":"uint256"},{"indexed":false,"internalType":"string","name":"rewardIds","type":"string"}],"name":"Claim","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":false,"internalType":"uint256","name":"id","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"mud","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"usdt","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"unlockTime","type":"uint256"}],"name":"Delegate","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"Depositer","type":"address"},{"indexed":false,"internalType":"uint256","name":"mud","type":"uint256"}],"name":"Deposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"account","type":"address"}],"name":"Paused","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"uint256","name":"mud","type":"uint256"}],"name":"Profit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":false,"internalType":"uint256","name":"id","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"usdt","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"mud","type":"uint256"}],"name":"Undelegate","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"account","type":"address"}],"name":"Unpaused","type":"event"},{"inputs":[{"internalType":"uint256","name":"usdt","type":"uint256"},{"internalType":"uint256","name":"minMud","type":"uint256"},{"internalType":"string","name":"rewardIds","type":"string"},{"internalType":"bytes","name":"signature","type":"bytes"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"mud","type":"uint256"},{"internalType":"uint256","name":"minUsdt","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"delegate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"delegations","outputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"address","name":"delegator","type":"address"},{"internalType":"uint256","name":"mud","type":"uint256"},{"internalType":"uint256","name":"usdt","type":"uint256"},{"internalType":"uint256","name":"back_mud","type":"uint256"},{"internalType":"uint256","name":"periodDuration","type":"uint256"},{"internalType":"uint256","name":"periodNum","type":"uint256"},{"internalType":"uint256","name":"unlockTime","type":"uint256"},{"internalType":"bool","name":"withdrew","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"mud","type":"uint256"}],"name":"deposit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"minPersonInvestUsdt","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"mudAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"mudPrice","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pause","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"paused","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"periodDuration","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"periodNum","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"poolAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"mud","type":"uint256"}],"name":"profit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_periodDuration","type":"uint256"}],"name":"setPeriodDuration","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"signerAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalDelegate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"uint256","name":"minMud","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"undelegate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"unpause","outputs":[],"stateMutability":"nonpayable","type":"function"}]`
)
export const delaney = new ethers.Contract(delaneyAddress, delaneyAbi, provider)

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
    buyUsdt,
    buyMud,
    buyUsdtWei,
    buyMudWei
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
    sqrtPriceX96: slot0.sqrtPriceX96.toString()
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
