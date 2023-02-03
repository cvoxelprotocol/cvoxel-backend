import { OrganizationWIthId, Organization } from "vess-sdk";
import { ethers, providers } from "ethers";
import { getVESSForNode, VessForNode } from "vess-sdk";
import { isProd } from "./commonUtil.js";

export const ETH_CHAIN_ID = "eip155:1:";

export const createOrganization = async (
  vess: VessForNode,
  name: string,
  admin: string,
  ethereumAddress: string,
  desc?: string,
  icon?: string,
  orbisSocialGroupId?: string
): Promise<OrganizationWIthId> => {
  const org: Organization = {
    admin: {
      id: admin,
      ethereumAddress: ethereumAddress,
    },
    name,
    desc: desc || "",
    icon: icon || "",
    orbisSocialGroupId: orbisSocialGroupId || "",
  };
  try {
    const { streamId, status } = await vess.createOrganization(org);
    if (!streamId || status !== 200) {
      throw new Error("Failed to create org on ceramic");
    }
    return { ...org, ceramicId: streamId };
  } catch (error) {
    throw new Error("Failed to create org on ceramic");
  }
};

export const initializeVESS = async () => {
  // sig and create vc
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  if (!process.env.SEED) {
    throw new Error("Missing SEED environment variable");
  }
  const provider = new providers.AlchemyProvider("homestead", ALCHEMY_API_KEY);
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signer = wallet.connect(provider);
  const address = await signer.getAddress();

  const vess = getVESSForNode(!isProd());
  const session = await vess.connect(
    address,
    async (message) => {
      const signed = await signer.signMessage(message);
      return signed;
    },
    isProd() ? "mainnet" : "testnet-clay"
  );
  const sessionStr = session.serialize();
  console.log({ sessionStr });
  return { session, provider, signer, vess };
};
