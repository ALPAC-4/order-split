import { LCDClient } from '@terra-money/terra.js'
import { getAmp, sortAssets, isSameInfo, getDecimals, xykCal, stableCal } from 'utils'

// example of luna_bluna
async function oneinchLikeMethod() {
  const lcd = new LCDClient({
    URL: 'https://lcd.terra.dev',
    chainID: 'columbus-5',
  })

  const offerAsset: Asset = {
    info: { native_token: { denom: 'uluna' } },
    // 100,000 luna
    amount: '100000000000'
  }

  // bluna
  const askAssetInfo: AssetInfo = { token: { contract_addr: 'terra1kc87mu460fwkqte29rquh4hc20m54fxwtsx7gp' }}

  // astroport bluna-luna pair
  const astroportPair = 'terra1j66jatn3k50hjtg2xemnjm8s7y8dws9xqa5y8w'
  // terraswap bluna-luna pair
  const terraswapPair = 'terra1jxazgm67et0ce260kvrpfv50acuushpjsz2y0p'

  const amp = await getAmp(lcd, astroportPair)
  const astroportPool = await lcd.wasm.contractQuery<PoolQueryRes>(astroportPair, {pool:{}})
  const terraswapPool = await lcd.wasm.contractQuery<PoolQueryResXyk>(terraswapPair, {pool:{}})
  terraswapPool.assets = sortAssets(terraswapPool.assets, offerAsset)


  const [poolReserves, offerAssetIndex, askAssetIndex]: [PoolReserve[], number, number] 
    = await getPoolReserves(lcd, astroportPool, offerAsset, askAssetInfo)

  if (offerAssetIndex === undefined || askAssetInfo === undefined) {
    throw Error('wrong asset offer')
  }
  let remain = Number(offerAsset.amount)
  const parts = 100

  // [astro amount, terraswap amount]
  const offerAmounts = [0, 0]

  for (let i = 0; i < parts; i++) {
    const offerAmount = i === parts - 1 ? remain : Math.floor(Number(offerAsset.amount) / parts)
    const astroReturn = Number(stableCal(offerAmount, poolReserves, offerAssetIndex, askAssetIndex, 0.0005, amp).return_amount)
    const terraswapReturn = Number(xykCal(offerAmount, Number(terraswapPool.assets[0].amount), Number(terraswapPool.assets[1].amount), 0.003).return_amount)
    if (astroReturn > terraswapReturn) {
      offerAmounts[0] += offerAmount
      poolReserves[offerAssetIndex].amount += offerAmount
      poolReserves[askAssetIndex].amount -= astroReturn
    } else {
      offerAmounts[1] += offerAmount
      terraswapPool.assets[0].amount = (Number(terraswapPool.assets[0].amount) + offerAmount).toString()
      terraswapPool.assets[1].amount = (Number(terraswapPool.assets[1].amount) - terraswapReturn).toString()
    }
    remain -= offerAmount
  }
  
  const astroportSimulationRes = await lcd.wasm.contractQuery<SimulationRes>(
    astroportPair,
    {
      simulation: {
        offer_asset: {
          info: offerAsset.info,
          amount: offerAmounts[0].toString()
        }
      }
    }
  )
  const terraswapSimulationRes = await lcd.wasm.contractQuery<SimulationRes>(
    terraswapPair,
    {
      simulation: {
        offer_asset: {
          info: offerAsset.info,
          amount: offerAmounts[1].toString()
        }
      }
    }
  )

  console.log(`Use order split\n${Number(terraswapSimulationRes.return_amount) + Number(astroportSimulationRes.return_amount)}`)
 
  await lcd.wasm.contractQuery<SimulationRes>(terraswapPair, {simulation:{offer_asset: offerAsset}})
  .then(res => console.log(`Only Terraswap\n${res.return_amount}`))
 
  await lcd.wasm.contractQuery<SimulationRes>(astroportPair, {simulation:{offer_asset: offerAsset}})
  .then(res => console.log(`Only Astroport\n${res.return_amount}`))
}

async function getPoolReserves(
  lcd: LCDClient,
  stablePoolRes: PoolQueryRes,
  offerAsset: Asset,
  askAssetInfo: AssetInfo
): Promise<[PoolReserve[], number, number]>{
  const result: PoolReserve[] = []
  let offerAssetIndex: number
  let askAssetIndex: number
  for (let i = 0; i < stablePoolRes.assets.length; i ++) {
    let asset = stablePoolRes.assets[i]
    if (isSameInfo(offerAsset.info, asset.info)) {
      offerAssetIndex = i
    } else if(isSameInfo(askAssetInfo, asset.info)) {
      askAssetIndex = i
    }
    result.push({
      amount: Number(asset.amount),
      decimals: await getDecimals(lcd, asset.info)
    })
  }
  
  return [result, offerAssetIndex, askAssetIndex]
}

oneinchLikeMethod()