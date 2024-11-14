import { ethers } from 'ethers'
import bn from 'bignumber.js'

const formatDateISO = (date) => {
  // Convert the date to ISO string
  const isoString = date.toISOString()
  // Split at the "T" character to get the date part
  const formattedDate = isoString.split('T')[0]
  return formattedDate
}

const getPrice = (sqrtPriceX96, decimal0, decimal1) => {
  sqrtPriceX96 = bn(sqrtPriceX96)
  decimal0 = bn(decimal0)
  decimal1 = bn(decimal1)

  const buyOneOfToken0 = sqrtPriceX96
    .div(bn(2).pow(96))
    .pow(2)
    .div(bn(10).pow(decimal1.toNumber()).div(bn(10).pow(decimal0.toNumber())))
  const buyOneOfToken1 = bn(1).div(buyOneOfToken0)

  // Convert to wei
  // const buyOneOfToken0Wei = bn(Math.floor(buyOneOfToken0.multipliedBy(10 ** decimal1.toNumber()))).toFormat(0, bn.ROUND_DOWN, { decimalSeparator: '' })
  // const buyOneOfToken1Wei = bn(Math.floor(buyOneOfToken1.multipliedBy(10 ** decimal0.toNumber()))).toFormat(0, bn.ROUND_DOWN, { decimalSeparator: '' })

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
  const provider = new ethers.JsonRpcProvider(
    'https://polygon.drpc.org' ||
      // 'https://polygon-mainnet.nodereal.io/v1/c6a4d008708642b097e1d7c9372a3b67' ||
      'https://omniscient-floral-wish.matic.quiknode.pro/c8744f4ef0f1f40210d5d68ac6170281c379b088'
  )
  const poolAddress = '0x5338968f9646e4a865d76e07c2a6e340dd3ac462'
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

  return { ...price, timestamp: block.timestamp, hash: block.hash, time: new Date(block.timestamp * 1000).toISOString() }
}
