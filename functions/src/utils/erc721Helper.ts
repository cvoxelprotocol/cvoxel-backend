import {
  Erc721enumerate,
  Erc721enumerate__factory,
} from "../../types/ethers-contracts/index.js";
import { BigNumber } from "ethers";
import fetch from "node-fetch";

const DEV_PROTOCOL_ADDRESS = "";

const getAddress = () => {
  return DEV_PROTOCOL_ADDRESS;
};

const getContract = () => {
  const address = getAddress();
  return Erc721enumerate__factory.connect(address);
};

export const balanceOf = async (owner: string): Promise<BigNumber> => {
  const contract: Erc721enumerate = getContract();
  return await contract.balanceOf(owner);
};

export const tokenOfOwnerByIndex = async (
  owner: string,
  index: BigNumber
): Promise<BigNumber> => {
  const contract: Erc721enumerate = getContract();
  return await contract.tokenOfOwnerByIndex(owner, index);
};

export const tokenURI = async (tokenId: BigNumber): Promise<string> => {
  const contract: Erc721enumerate = getContract();
  return await contract.tokenURI(tokenId);
};

const getTokensMetadata = async <T>(owner: string): Promise<T[]> => {
  const balance = await balanceOf(owner);

  const result: T[] = [];

  for (let i = BigNumber.from(0); balance.lt(i); i.add(1)) {
    const tokenId = await tokenOfOwnerByIndex(owner, i);
    const metadataURI = await tokenURI(tokenId);
    const res = await fetch(metadataURI, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    result.push((await res.json()) as T);
  }

  return result;
};
