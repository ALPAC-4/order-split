import { LCDClient } from '@terra-money/terra.js'
import { sortAssets } from './utils'

function useTwoDex(pairInfos: [PairInfo, PairInfo], offerAsset: Asset): [Asset, Asset] {
  pairInfos = [
    {
      assets: sortAssets(pairInfos[0].assets, offerAsset),
      commissionRate: pairInfos[0].commissionRate,
      adjustedLiquidity: adjustedLiquidity(pairInfos[0])
    },
    {
      assets: sortAssets(pairInfos[1].assets, offerAsset),
      commissionRate: pairInfos[1].commissionRate,
      adjustedLiquidity: adjustedLiquidity(pairInfos[1])
    },
  ]

  let offerAmount0 = Math.floor((
    Number(pairInfos[1].assets[0].amount) * pairInfos[0].adjustedLiquidity 
    + Number(offerAsset.amount) * pairInfos[0].adjustedLiquidity
    - Number(pairInfos[0].assets[0].amount) * pairInfos[1].adjustedLiquidity
  ) / (
    pairInfos[0].adjustedLiquidity + pairInfos[1].adjustedLiquidity
  ))

  offerAmount0 = offerAmount0 <= 0 ? 0 : offerAmount0 >= Number(offerAsset.amount) ? Number(offerAsset.amount) : offerAmount0

  const offerAmount1 = Number(offerAsset.amount) - offerAmount0

  return [
    {
      info: offerAsset.info,
      amount: offerAmount0.toString()
    },
    {
      info: offerAsset.info,
      amount: offerAmount1.toString()
    },
  ]
}

// sqrt(liquidity * (1 - commissionRate))
function adjustedLiquidity(pairInfo: PairInfo) {
  return (Number(pairInfo.assets[0].amount) 
    * Number(pairInfo.assets[1].amount) 
    * (1 - pairInfo.commissionRate)) ** 0.5
}

async function exampleLunaUst() {
  const lcd = new LCDClient({
    URL: 'https://lcd.terra.dev',
    chainID: 'columbus-5',
  })

  // luna-ust terraswap pair
  const terraswapPair = 'terra1tndcaqxkpc5ce9qee5ggqf430mr2z3pefe5wj6'
  // luna-ust astroport pair
  const astroportPair = 'terra1m6ywlgn6wrjuagcmmezzz2a029gtldhey5k552'

  const offerAsset: Asset = {
    info: { native_token: { denom: 'uusd' } },
    // 100,000,000 UST
    amount: '100000000000000'
  }

  const terraswapPool = await lcd.wasm.contractQuery<PoolQueryResXyk>(terraswapPair, {pool:{}})
  const astroportPool = await lcd.wasm.contractQuery<PoolQueryResXyk>(astroportPair, {pool:{}})
  const pairInfos: [PairInfo, PairInfo] = [
    {
      assets: terraswapPool.assets,
      commissionRate: 0.003
    },
    {
      assets: astroportPool.assets,
      commissionRate: 0.003
    }
  ]

  const offerAssets = useTwoDex(pairInfos, offerAsset)

  const terraswapSimulationRes = await lcd.wasm.contractQuery<SimulationRes>(terraswapPair, {simulation:{offer_asset: offerAssets[0]}})
  const astroportSimulationRes = await lcd.wasm.contractQuery<SimulationRes>(astroportPair, {simulation:{offer_asset: offerAssets[1]}})

  console.log(`Use order split\n${Number(terraswapSimulationRes.return_amount) + Number(astroportSimulationRes.return_amount)}`)
 
  await lcd.wasm.contractQuery<SimulationRes>(terraswapPair, {simulation:{offer_asset: offerAsset}})
  .then(res => console.log(`Only Terraswap\n${res.return_amount}`))
 
  await lcd.wasm.contractQuery<SimulationRes>(astroportPair, {simulation:{offer_asset: offerAsset}})
  .then(res => console.log(`Only Astroport\n${res.return_amount}`))
}

exampleLunaUst()