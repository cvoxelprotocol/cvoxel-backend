import {
  EventAttendanceWithId,
  EventWithId,
  WorkCredentialWithDeworkTaskId,
  WorkSubjectFromDework,
} from "../types/workCredential.js";
import {
  createTileDocument,
  getCeramicUrl,
  getDatamodel,
  getSchema,
  getTempAuthMethod,
  issueWorkCRDL,
} from "../utils/ceramicHelper.js";
import {
  createWorkCRDLsFromDework,
  issueEventAttendanceCredentials,
} from "../utils/etherHelper.js";
import { EventAttendanceVerifiableCredential } from "../__generated__/types/EventAttendanceVerifiableCredential.js";
import { IssuedEventAttendanceVerifiableCredentials } from "../__generated__/types/IssuedEventAttendanceVerifiableCredentials.js";
import { DIDDataStore } from "@glazed/did-datastore";
import { DIDSession } from "did-session";
import { CeramicClient } from "@ceramicnetwork/http-client";
import { ethers, providers } from "ethers";
// @ts-ignore
import { AccountId } from "caip";

export const issueWorkCRDLsFromDework = async (
  targetTasks: WorkSubjectFromDework[]
): Promise<WorkSubjectFromDework[]> => {
  // sign and create crdls
  const crdlsWithTaskIds = await createWorkCRDLsFromDework(targetTasks);

  const promises: Promise<WorkSubjectFromDework>[] = [];
  for (const crdlsWithTaskId of crdlsWithTaskIds) {
    // store into Ceramic
    const p = issueWorkCRDLFromDework(crdlsWithTaskId);
    promises.push(p);
  }
  return await Promise.all(promises);
};

export const issueWorkCRDLFromDework = async (
  crdlsWithTaskId: WorkCredentialWithDeworkTaskId
): Promise<WorkSubjectFromDework> => {
  console.log("crdl", crdlsWithTaskId.crdl);
  const id = await issueWorkCRDL(crdlsWithTaskId.crdl);

  console.log("streamId: ", id);
  const updatedTask: WorkSubjectFromDework = {
    ...crdlsWithTaskId.crdl.subject,
    streamId: id,
    taskId: crdlsWithTaskId.taskId,
  };
  return updatedTask;
};

export const issueEventAttendanceCredential = async (
  content: EventWithId,
  dids: string[]
): Promise<EventAttendanceWithId[]> => {
  try {
    const vcs = await issueEventAttendanceCredentials(content, dids);

    const docsPromises: Promise<EventAttendanceWithId>[] = [];

    for (const vc of vcs) {
      console.log({ vc });
      const docPromise = storeEventAttendanceOnCeramic(vc);
      docsPromises.push(docPromise);
    }
    const docs = await Promise.all(docsPromises);
    const docUrls = docs.map((doc) => doc.ceramicId);
    await setIssuedEventAttendanceVerifiableCredentials(docUrls);
    return docs;
  } catch (error) {
    console.log(JSON.stringify(error));
    throw new Error("Failed to create event crdl on ceramic");
  }
};

const storeEventAttendanceOnCeramic = async (
  vc: EventAttendanceVerifiableCredential
): Promise<EventAttendanceWithId> => {
  const doc = await createTileDocument<EventAttendanceVerifiableCredential>(
    vc,
    getSchema("EventAttendanceVerifiableCredential"),
    ["vess", "eventAttendanceCredential"]
  );
  const id = doc.id.toUrl();
  console.log({ id });
  return { ...doc.content, ceramicId: id };
};

const setIssuedEventAttendanceVerifiableCredentials = async (
  contentIds: string[]
): Promise<void> => {
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  // const INFURA_API_KEY = process.env.INFURA_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const ethProvider = new providers.AlchemyProvider(
    "homestead",
    ALCHEMY_API_KEY
  );
  // const ethProvider = new providers.InfuraProvider("homestead", INFURA_API_KEY);
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
  // temp solution
  const authMethod = await getTempAuthMethod(accountId, "app.vess.id", signer);

  const session = await DIDSession.authorize(authMethod, {
    resources: ["ceramic://*"],
  });

  const ceramic = new CeramicClient(getCeramicUrl());
  ceramic.did = session.did;

  const dataStore = new DIDDataStore({
    ceramic: ceramic,
    model: getDatamodel(),
    id: session.did.parent,
  });
  const IssuedEventAttendanceVerifiableCredentials = await dataStore.get<
    "IssuedEventAttendanceVerifiableCredentials",
    IssuedEventAttendanceVerifiableCredentials
  >("IssuedEventAttendanceVerifiableCredentials", session.did.parent);
  const currentVal = IssuedEventAttendanceVerifiableCredentials?.issued ?? [];
  const updatedVal = [...currentVal, ...contentIds];
  await dataStore.set("IssuedEventAttendanceVerifiableCredentials", {
    issued: updatedVal,
  });
};
