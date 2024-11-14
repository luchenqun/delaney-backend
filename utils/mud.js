import { ethers } from 'ethers'

const decodeSqrtPriceX96ToP = (sqrtPriceX96) => {
  // Q64.96 定点数 2^96
  const q96 = Math.pow(2, 96)
  // 计算 sqrtPriceRatio
  const sqrtPriceRatio = sqrtPriceX96 / q96
  // P = (sqrtPriceRatio)^2
  const P = Math.pow(sqrtPriceRatio, 2)
  return P
}

// 将P根据代币的精度调整成真实价格
const adjustPByDecimal = (price, baseDecimalPow, quoteDecimalPow, quoteIs0) => {
  let decimal0Pow, decimal1Pow
  if (quoteIs0) {
    decimal0Pow = quoteDecimalPow
    decimal1Pow = baseDecimalPow
  } else {
    decimal0Pow = baseDecimalPow
    decimal1Pow = quoteDecimalPow
  }

  const adjustment = decimal0Pow / decimal1Pow
  price *= adjustment

  // 如果Quote是token0，计算1/price
  if (quoteIs0) {
    price = 1 / price
  }

  return price
}

export const mudPrice = async (blockTag) => {
  const provider = new ethers.JsonRpcProvider(
    // 'https://polygon.drpc.org' ||
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
  const realPrice = decodeSqrtPriceX96ToP(parseFloat(slot0.sqrtPriceX96.toString()))
  const price = adjustPByDecimal(realPrice, 1e6, 1e6, true)

  return price / 1.005 // 需要一些手续费
}
