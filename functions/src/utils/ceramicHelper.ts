/* eslint-disable @typescript-eslint/no-var-requires */
import * as functions from "firebase-functions";
import { CeramicClient } from "@ceramicnetwork/http-client";
import { TileDocument } from "@ceramicnetwork/stream-tile";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import { AliasTypes, OrganizationWIthId } from "../types/workCredential.js";
import { aliases as prodAliaes } from "../__generated__/aliases.js";
import { aliases as devAliases } from "../__generated__/aliases_dev.js";
import { Organization } from "../__generated__/types/Organization.js";
import { WorkCredential } from "../__generated__/types/WorkCredential.js";
import { removeUndefined } from "./commonUtil.js";
import { ethers, providers } from "ethers";
// @ts-ignore
import { AccountId } from "caip";
import { DIDSession, createDIDKey } from "did-session";
import { randomBytes } from "ethers/lib/utils.js";
import {
  Cacao,
  SiweMessage,
  AuthMethodOpts,
  AuthMethod,
} from "@didtools/cacao";
import { randomString } from "@stablelib/random";

export const ETH_CHAIN_ID = "eip155:1:";
const APP_ENV = functions.config().app.environment;

export const getCeramicUrl = () => {
  if (process.env.NODE_ENV === "production" && APP_ENV === "production") {
    console.log("connected ceramic: ", process.env.CERAMIC_URL_PROD);
    return process.env.CERAMIC_URL_PROD || "http://localhost:7007";
  } else if (process.env.NODE_ENV === "production" && APP_ENV === "dev") {
    console.log("connected ceramic: ", process.env.CERAMIC_URL_DEV);
    return process.env.CERAMIC_URL_DEV || "http://localhost:7007";
  } else {
    console.log("connected ceramic: ", process.env.CERAMIC_URL_LOCAL);
    return process.env.CERAMIC_URL_LOCAL || "http://localhost:7007";
  }
};

export const getSchema = (alias: AliasTypes): string => {
  if (process.env.NODE_ENV === "production" && APP_ENV === "production") {
    return prodAliaes.schemas[alias];
  } else {
    return devAliases.schemas[alias];
  }
};

export const getDatamodel = () => {
  if (process.env.NODE_ENV === "production" && APP_ENV === "production") {
    return prodAliaes;
  } else {
    return devAliases;
  }
};

const ethAddressRegex = /^0x[0-9a-f]{40}$/i;
export const isEthereumAddress = (address: string): boolean => {
  return ethAddressRegex.test(address);
};

export const getPkhDIDFromAddress = (address: string): string => {
  if (isEthereumAddress(address)) {
    return `did:pkh:${ETH_CHAIN_ID}${address}`;
  } else {
    return address;
  }
};

export const removeCeramicPrefix = (docUrl?: string) => {
  if (!docUrl) return "";
  return docUrl.replace(`ceramic://`, "");
};

export const createOrganization = async (
  name: string,
  admin: string,
  desc?: string,
  icon?: string,
  orbisSocialGroupId?: string
): Promise<OrganizationWIthId> => {
  const org: Organization = {
    admin,
    name,
    desc: desc || "",
    icon: icon || "",
    orbisSocialGroupId: orbisSocialGroupId || "",
  };
  try {
    const doc = await createTileDocument<Organization>(
      org,
      getSchema("Organization"),
      ["vess", "organizationCredential"]
    );
    console.log({ doc });
    return { ...org, ceramicId: doc.id.toUrl() };
  } catch (error) {
    throw new Error("Failed to create org on ceramic");
  }
};

export const issueWorkCRDL = async (crdl: WorkCredential): Promise<string> => {
  try {
    const doc = await createTileDocument<WorkCredential>(
      crdl,
      getSchema("WorkCredential"),
      ["vess", "workCredential"]
    );
    return doc.id.toUrl();
  } catch (error) {
    throw new Error("Failed to create work crdl on ceramic");
  }
};

export const createTileDocument = async <T extends Record<string, any>>(
  content: T,
  schema: string,
  tags: string[] = ["vess", "workCredential"],
  family = "VESS"
): Promise<TileDocument<T>> => {
  if (!process.env.SEED) {
    throw new Error("Missing SEED environment variable");
  }
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const ethProvider = new providers.AlchemyProvider(
    "homestead",
    ALCHEMY_API_KEY
  );
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signer = wallet.connect(ethProvider);
  const address = await signer.getAddress();

  signer.signMessage;

  console.log("address", address);

  const accountId = new AccountId({
    chainId: "eip155:1",
    address: address,
  });

  console.log("accountId", accountId);
  const authMethod = await getTempAuthMethod(accountId, "app.vess.id", signer);

  const session = await DIDSession.authorize(authMethod, {
    resources: ["ceramic://*"],
  });

  const ceramic = new CeramicClient(getCeramicUrl());
  console.log({ ceramic });
  ceramic.did = session.did;

  try {
    const doc = await TileDocument.create(
      ceramic,
      removeUndefined<T>(content),
      {
        family: family,
        controllers: [session.did.parent],
        tags: tags,
        schema: schema,
      }
    );
    return doc;
  } catch (e) {
    console.log("Error creating TileDocument: ", e);
    throw new Error("Error creating TileDocument ");
  }
};

export const updateTileDocument = async <T>(
  streamId: string,
  content: T,
  schema: string,
  tags: string[] = ["vess", "workCredential"],
  family = "VESS"
): Promise<string | null> => {
  if (!process.env.SEED) {
    throw new Error("Missing SEED environment variable");
  }
  const seed = Uint8Array.from(Buffer.from(process.env.SEED, "hex"));
  // const seed = fromString(process.env.SEED, "base16");
  const did = new DID({
    provider: new Ed25519Provider(seed),
    resolver: getResolver(),
  });
  await did.authenticate();
  const ceramic = new CeramicClient(getCeramicUrl());
  ceramic.did = did;

  let doc;
  try {
    doc = await TileDocument.load(ceramic, streamId);
    await doc.update(content, {
      family: family,
      controllers: [did.id],
      tags: tags,
      schema: schema,
    });

    return doc.id.toUrl();
  } catch (e) {
    return null;
  }
};

// temporary solution
export const getTempAuthMethod = async (
  account: AccountId,
  appName: string,
  signer: ethers.Wallet
): Promise<AuthMethod> => {
  return async (opts: AuthMethodOpts): Promise<Cacao> => {
    opts.domain = appName;
    return createTempCACAO(opts, account, signer);
  };
};

const createTempCACAO = async (
  opts: AuthMethodOpts,
  account: AccountId,
  signer: ethers.Wallet
): Promise<Cacao> => {
  const VERSION = "1";
  const now = new Date();
  const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const keySeed = randomBytes(32);
  const didKey = await createDIDKey(keySeed);

  const siweMessage = new SiweMessage({
    domain: opts.domain,
    address: account.address,
    statement:
      opts.statement ??
      "Give this application access to some of your data on Ceramic",
    uri: opts.uri || didKey.id,
    version: VERSION,
    nonce: opts.nonce ?? randomString(10),
    issuedAt: now.toISOString(),
    expirationTime: opts.expirationTime ?? oneDayLater.toISOString(),
    chainId: account.chainId.reference,
    resources: opts.resources,
  });

  const signature = await signer.signMessage(siweMessage.signMessage());
  console.log({ signature });
  siweMessage.signature = signature;
  return Cacao.fromSiweMessage(siweMessage);
};
