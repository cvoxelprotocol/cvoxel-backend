export type TransactionLog = {
  blockHash: string;
  blockNumber: string;
  confirmations: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  hash: string;
  input: string;
  isError: string;
  nonce: string;
  timeStamp: string;
  to: string;
  transactionIndex: string;
  // eslint-disable-next-line camelcase
  txreceipt_status: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

export type TransactionLogWithChainId = TransactionLog & {
  chainId: number;
};

export type EtherscanResult = {
  status: string;
  message: string;
  result: TransactionLog[];
};
