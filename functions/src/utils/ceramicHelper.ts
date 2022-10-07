/* eslint-disable @typescript-eslint/no-var-requires */
import * as functions from "firebase-functions";
import { CeramicClient } from "@ceramicnetwork/http-client";
import { TileDocument } from "@ceramicnetwork/stream-tile";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import { AliasTypes } from "../types/workCredential.js";
import { aliases as prodAliaes } from "../__generated__/aliases.js";
import { aliases as devAliases } from "../__generated__/aliases_dev.js";
import { Organization } from "../__generated__/types/Organization.js";
import { WorkCredential } from "../__generated__/types/WorkCredential.js";
import { removeUndefined } from "./commonUtil.js";

export const ETH_CHAIN_ID = "eip155:1:";
const APP_ENV = functions.config().app.environment;

const getCeramicUrl = () => {
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

export const createOrganization = async (
  name: string,
  admin: string,
  desc?: string,
  icon?: string,
  orbisSocialGroupId?: string
): Promise<string> => {
  const org: Organization = {
    admin,
    name,
    desc: desc || "",
    icon: icon || "",
    orbisSocialGroupId: orbisSocialGroupId || "",
  };
  const doc = await createTileDocument<Organization>(
    org,
    getSchema("Organization"),
    ["vess", "organizationCredential"]
  );
  if (!doc) {
    throw new Error("Failed to create org on ceramic");
  }
  console.log({ doc });
  return doc.id.toUrl();
};

export const issueWorkCRDL = async (crdl: WorkCredential): Promise<string> => {
  const doc = await createTileDocument<WorkCredential>(
    crdl,
    getSchema("WorkCredential"),
    ["vess", "workCredential"]
  );
  if (!doc) {
    throw new Error("Failed to create work crdl on ceramic");
  }
  return doc.id.toUrl();
};

export const createTileDocument = async <T extends Record<string, any>>(
  content: T,
  schema: string,
  tags: string[] = ["vess", "workCredential"],
  family = "VESS"
): Promise<TileDocument<T> | null> => {
  if (!process.env.SEED) {
    throw new Error("Missing SEED environment variable");
  }
  // const seed = fromstring(process.env.SEED, "base16");
  const seed = Uint8Array.from(Buffer.from(process.env.SEED, "hex"));
  console.log({ seed });
  const did = new DID({
    provider: new Ed25519Provider(seed),
    resolver: getResolver(),
  });
  console.log({ did });
  const res = await did.authenticate();
  console.log({ res });
  const ceramic = new CeramicClient(getCeramicUrl());
  console.log({ ceramic });
  ceramic.did = did;

  try {
    const doc = await TileDocument.create(
      ceramic,
      removeUndefined<T>(content),
      {
        family: family,
        controllers: [did.id],
        tags: tags,
        schema: schema,
      }
    );
    return doc;
  } catch (e) {
    console.log("Error creating TileDocument: ", e);
    return null;
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
