import { LCDClient } from '@terra-money/terra.js'

export function isSameInfo(info0: AssetInfo, info1: AssetInfo) {
  return JSON.stringify(info0) === JSON.stringify(info1)
}

// make assets[0].info === offerAsset.info where assets: [Asset, Asset] 
export function sortAssets(assets: [Asset, Asset], offerAsset: Asset): [Asset, Asset]{
  if (isSameInfo(assets[0].info, offerAsset.info)) {
    return assets
  } else {
    return [assets[1], assets[0]]
  }
}

export async function getAmp(lcd: LCDClient, pair: string): Promise<number> {
  return lcd.wasm.contractQuery<ConfigRes>(pair, {config:{}})
  .then(res => {
    const obj = JSON.parse(Buffer.from(res.params, 'base64').toString())
    // 100 is amp_percision
    return Number(obj.amp) * 100
  })
}

export async function getDecimals(lcd: LCDClient, assetInfo: AssetInfo): Promise<number> {
  if (isNative(assetInfo)) {
    return 6
  } else {
    const tokenInfo = assetInfo as Token
    return lcd.wasm.contractQuery<TokenInfoRes>(tokenInfo.token.contract_addr, {token_info:{}})
    .then(res => res.decimals)
  }
}

function isNative(assetInfo: AssetInfo): boolean {
  const assetInfoAny = assetInfo as any
  if (assetInfoAny.native_token) {
    return true
  } else {
    return false
  }
}


export function xykCal(
  offerAmount: number,
  offerPoolReserve: number,
  askPoolReserve: number,
  commissionRate: number
): SimulationRes {
  // return amount before sub commission
  let return_amount = Math.floor(offerAmount * askPoolReserve / (offerAmount + offerPoolReserve))
  const spread_amount = Math.floor(offerAmount * askPoolReserve / offerPoolReserve) - return_amount 
  const commission_amount = Math.floor(return_amount * commissionRate)
  return_amount -= commission_amount
  return { 
    return_amount: return_amount.toString(),
    spread_amount: spread_amount.toString(),
    commission_amount: commission_amount.toString() 
  }
}


function compute_d(leverage: number, amounts: number[]): number {
  // this is wrong but astro hard code it
  const sum = amounts.reduce((p,c,_) => p + c)
  const count = amounts.length
  const adjustedAmount = amounts.map((v, _) => v * count + 1)

  let d_prev: number
  let d = sum

  // newton apporx
  for (let i = 0; i < 32; i++) {
    let d_product = adjustedAmount.reduce((p, c, index) => index === 1 ? (d * d / p) * (d / c) : (p * d / c))
    d_prev = d

    d = ((leverage * sum)/100 + d_product * count) * d / ((leverage/100 - 1) * d + (count + 1) * d_product)

    if (d === d_prev) break;
  }

  return d
}

export function stableCal(
  offerAmount: number,
  poolReserves: PoolReserve[],
  offerAssetIndex: number ,
  askAssetIndex: number,
  commissionRate: number,
  amp: number
): SimulationRes {
  //adjust decimals diff
  let largestDecimals = 0 
  poolReserves.map((v, _) => largestDecimals = largestDecimals < v.decimals ? v.decimals : largestDecimals)
  let offerAssetDecimalsDiff: number
  let askAssetDecimalsDiff: number


  const decimalsAdjustedPoolReserves = poolReserves.map((v, i) => {
    const decimalsDiff = largestDecimals - v.decimals
    v.amount = v.amount * (10 ** decimalsDiff)
    if (i == offerAssetIndex) {
      offerAmount = offerAmount * (10 ** decimalsDiff)
      offerAssetDecimalsDiff = decimalsDiff
    } else if (i == askAssetIndex) {
      askAssetDecimalsDiff = decimalsDiff
    }
    return v
  })
  
  const count = poolReserves.length
  const leverage = amp * count
  const d = compute_d(leverage, decimalsAdjustedPoolReserves.map((v, _) => v.amount))

  const offerPoolReserveAfter =  decimalsAdjustedPoolReserves[offerAssetIndex].amount + offerAmount 

  const c = (d ** (count + 1)) * 100 / (offerPoolReserveAfter * (count ** 2) * leverage)

  const b = offerPoolReserveAfter + (d * 100 / leverage)

  // proximate
  let y_prev: number
  let y = d;
  for (let i = 0; i < 32; i++) {
    y_prev = y;
    y = (y ** 2 + c) / (y * 2 + b - d)

    if (y === y_prev) break;
  }
  
  const askPoolReserveAfter = y

  // return amount before sub commission
  let return_amount = (decimalsAdjustedPoolReserves[askAssetIndex].amount - askPoolReserveAfter) / (10 ** (askAssetDecimalsDiff))
  const commission_amount = Math.floor(return_amount * commissionRate)
  const spread_amount = (offerAmount / 10 ** (- askAssetDecimalsDiff + offerAssetDecimalsDiff))> return_amount ? offerAmount - return_amount : 0
  return_amount -= commission_amount

  return { 
    return_amount: Math.floor(return_amount).toString(),
    spread_amount: Math.floor(spread_amount).toString(),
    commission_amount: Math.floor(commission_amount).toString() 
  }
}