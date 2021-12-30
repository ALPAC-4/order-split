
interface PairInfo {
  assets: [Asset, Asset]
  commissionRate: number
  adjustedLiquidity?: number
}

interface NativeToken {
  native_token: { denom: string }
}

interface Token {
  token: { contract_addr: string }
}

type AssetInfo = NativeToken | Token

interface Asset {
  info: AssetInfo
  amount: string
}

interface PoolQueryResXyk {
  assets: [Asset, Asset],
  total_share: string
}

interface SimulationRes {
  return_amount: string
  spread_amount: string
  commission_amount: string
}

interface ConfigRes {
  block_time_last: number
  params: string
}

// stable swap can have more than 2 assets
interface PoolQueryRes {
  assets: Asset[],
  total_share: string
}

interface PoolReserve {
  amount: number,
  decimals: number,
}

interface TokenInfoRes {
  name: string,
  symbol: string,
  decimals: number,
  total_supply: string
}