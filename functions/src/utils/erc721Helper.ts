import { BigNumber, ethers, providers } from "ethers";
import {
  Erc721enumerate,
  Erc721enumerate__factory,
} from "./typechian/index.js";
import { Transaction, Work, getPkhDIDFromAddress } from "vess-sdk";
import { convertDateToTimestampStr } from "./commonUtil.js";
import fetch from "node-fetch";
import { sendAlert } from "../index.js";
import { ERC721Data, WorkSubjectFromERC721 } from "../types/workCredential.js";
import { toUtf8Bytes } from "ethers/lib/utils.js";

const ETHEREUM_MAINNET_CHAIN_ID = 1;
const POLYGON_MAINNET_CHAIN_ID = 137;

const ETHEREUM_MAINNET_DEV_PROTOCOL_ADDRESS =
  "0x50489Ff5f879A44C87bBA85287729D663b18CeD5";
const POLYGON_MAINNET_DEV_PROTOCOL_ADDRESS =
  "0x89904De861CDEd2567695271A511B3556659FfA2";

const DEVPROTOCOL_URL = "https://api.devprotocol.xyz/v1/graphql";

const PROPERTY_AUTHENTICATION_OPERATION_NAME = "getPropertyAuthentication";
const PROPERTY_AUTHENTICATION_QUERY = `
query getPropertyAuthentication($propertyAddress: String!) {
  property_authentication(where: { property: { _eq: $propertyAddress } }) {
    authentication_id
    market
    metrics
    property_meta {
      author
      __typename
    }
    __typename
  }
}

`;

type RawDevProtocolSchema = {
  name: string;
  description: string;
  image: string;
  attributes: [
    {
      trait_type: string;
      value: string | number;
      display_type?: string;
    }
  ];
};

export type DevProtocolSchema = RawDevProtocolSchema & ERC721Data;

export type HandleERC721Contract = "DevProtocol";

const getAddress = (
  contract: HandleERC721Contract,
  chainId: number
): string => {
  switch (contract) {
    case "DevProtocol":
      switch (chainId) {
        case ETHEREUM_MAINNET_CHAIN_ID:
          return ETHEREUM_MAINNET_DEV_PROTOCOL_ADDRESS;
        case POLYGON_MAINNET_CHAIN_ID:
          return POLYGON_MAINNET_DEV_PROTOCOL_ADDRESS;
      }
  }
  throw new Error("Invalid chainid");
};

const getContract = (
  contract: HandleERC721Contract,
  chainId: number
): Erc721enumerate => {
  const address = getAddress(contract, chainId);

  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const provider = new providers.AlchemyProvider(chainId, ALCHEMY_API_KEY);

  return Erc721enumerate__factory.connect(address, provider);
};

export const balanceOf = async (
  contract: Erc721enumerate,
  owner: string
): Promise<BigNumber> => {
  return await contract.balanceOf(owner);
};

export const tokenOfOwnerByIndex = async (
  contract: Erc721enumerate,
  owner: string,
  index: BigNumber
): Promise<BigNumber> => {
  return await contract.tokenOfOwnerByIndex(owner, index);
};

export const tokenURI = async (
  contract: Erc721enumerate,
  tokenId: BigNumber
): Promise<string> => {
  return await contract.tokenURI(tokenId);
};

export const getTokensMetadata = async <T>(
  handleContract: HandleERC721Contract,
  chainId: number,
  owner: string
): Promise<T[]> => {
  const contract = getContract(handleContract, chainId);

  const balance = await balanceOf(contract, owner);

  const result: T[] = [];

  for (let i = BigNumber.from(0); balance.gt(i); i = i.add(1)) {
    const tokenId = await tokenOfOwnerByIndex(contract, owner, i);
    const metadataURI = await tokenURI(contract, tokenId);
    const encodedData = metadataURI.replace(/^data:\w+\/\w+;base64,/, "");
    const decoded = JSON.parse(Buffer.from(encodedData, "base64").toString());

    result.push({
      ...decoded,
      tokenURI: metadataURI,
      tokenId: tokenId,
      chainId: chainId,
      contractAddress: getAddress(handleContract, chainId),
    } as T);
  }

  return result;
};

export const convertDevProtocolToken2WorkSubject = async (
  chainId: number,
  address: string,
  token: DevProtocolSchema
) => {
  let destination = "";
  let value: number = 0;
  token.attributes.forEach((attr) => {
    switch (attr.trait_type) {
      case "Locked Amount":
        value = attr.value as number;
        return;
      case "Destination":
        destination = attr.value as string;
    }
  });

  let projectName = "";
  if (destination != "" && chainId == ETHEREUM_MAINNET_CHAIN_ID) {
    const res = await graphFetch(
      DEVPROTOCOL_URL,
      PROPERTY_AUTHENTICATION_OPERATION_NAME,
      PROPERTY_AUTHENTICATION_QUERY,
      { propertyAddress: destination }
    );
    if (res.data?.property_authentication?.length > 0) {
      const first = res.data?.property_authentication[0];
      projectName = first.authentication_id;
    }
  }

  const tx: Transaction = {
    txHash: "0x0",
    from: address,
    to: destination,
    isPayer: true,
    relatedTxHashes: [],
    fiatSymbol: "DEV",
    networkId: chainId,
  };

  const work: Work = {
    id: getPkhDIDFromAddress(address),
    value: value.toString(),
    tax: "0",
    summary:
      projectName != ""
        ? `Support ${projectName} on Stake.social`
        : `Support ${destination} on Stake.social`,
    detail: token.description,
    genre: "Donation&Investment",
    jobType: "OneTime",
    platform: "Stake.social",
    issuedAt: convertDateToTimestampStr(new Date()),
  };

  const subject: WorkSubjectFromERC721 = {
    work: work,
    tx: tx,
    client: {
      format: "DID",
      value: `did:pkh:eip155:${chainId}:${destination.toLowerCase()}`,
    },
    deliverables: [{ format: "url", value: token.tokenURI }],
    tokenURI: token.tokenURI,
    chainId: token.chainId,
    contractAddress: token.contractAddress,
    tokenId: token.tokenId.toString(),
    tokenHash: getTokenHash(
      token.chainId,
      token.contractAddress,
      token.tokenId.toString()
    ),
    streamId: null,
  };

  return subject;
};

const getTokenHash = (
  chainId: number,
  contractAddress: string,
  tokenId: string
): string => {
  return ethers.utils.keccak256(
    toUtf8Bytes(`${chainId}:${contractAddress}:${tokenId}`)
  );
};

const graphFetch = async (
  url: string,
  operationName: string,
  query: string,
  variables: { [x: string]: any }
): Promise<any> => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationName: operationName,
        query: query,
        variables: variables,
      }),
    });
    return res.json();
  } catch (error) {
    console.log(error);
    await sendAlert();
    await sendAlert(JSON.stringify(error));
  }
};
