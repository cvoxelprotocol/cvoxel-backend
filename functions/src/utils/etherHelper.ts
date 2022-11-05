import { signTypedData, SignTypedDataVersion } from "@metamask/eth-sig-util";
import { ethers, providers } from "ethers";
import {
  CLIENT_EIP712_TYPE,
  createEIP712VerifiableCredential,
  DeliverableItem,
  DELIVERABLES_EIP712_TYPE,
  DOMAIN_TYPE,
  EIP712DomainTypedData,
  EIP712MessageTypes,
  EIP712TypedData,
  EIP712WorkCredentialSubjectTypedData,
  EventAttendance,
  EventAttendanceVerifiableCredential,
  EventWithId,
  EVENT_ATTENDANCE_EIP712_TYPE,
  getPkhDIDFromAddress,
  PRIMARY_SUBJECT_TYPE,
  Signatures,
  TX_EIP712_TYPE,
  VerifiableCredential,
  W3CCredential,
  WorkCredential,
  WorkSubject,
  WORK_EIP712_TYPE,
  WORK_SUBJECT_EIP712_TYPE,
} from "vess-sdk";
import {
  WorkCredentialWithDeworkTaskId,
  WorkSubjectFromDework,
} from "../types/workCredential.js";
import {
  castUndifined2DefaultValue,
  convertDateToTimestampStr,
} from "./commonUtil.js";
import { cast2WorkSubject } from "./typeUtils.js";

export const DEFAULT_CONTEXT = "https://www.w3.org/2018/credentials/v1";
export const EIP712_CONTEXT =
  "https://raw.githubusercontent.com/w3c-ccg/ethereum-eip712-signature-2021-spec/main/contexts/v1/index.json";
export const DEFAULT_VC_TYPE = "VerifiableCredential";
export const MEMBERSHIP_VC_TYPE = "MembershipCredential";
export const EVENT_ATTENDANCE_VC_TYPE = "EventAttendanceCredential";

export const createWorkCRDLsFromDework = async (
  subjects: WorkSubjectFromDework[]
): Promise<WorkCredentialWithDeworkTaskId[]> => {
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const provider = new providers.AlchemyProvider("homestead", ALCHEMY_API_KEY);
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signer = wallet.connect(provider);
  const nowTimestamp = convertDateToTimestampStr(new Date());

  const crdlPromises: Promise<WorkCredentialWithDeworkTaskId>[] = [];

  console.log("wallet: ", signer.address);

  for (const deworkTask of subjects) {
    console.log("deworkTask", deworkTask.work?.summary);
    if (deworkTask.taskId) {
      const subject = convertValidworkSubjectTypedData(
        cast2WorkSubject(deworkTask)
      );
      const crdlPromise = signAndCreateWorkCRDLFromDework(
        deworkTask.taskId,
        subject,
        provider,
        signer,
        nowTimestamp
      );
      crdlPromises.push(crdlPromise);
    }
  }
  return await Promise.all(crdlPromises);
};

export const signAndCreateWorkCRDLFromDework = async (
  taskId: string,
  subject: WorkSubject,
  provider: ethers.providers.AlchemyProvider,
  signer: ethers.Wallet,
  createdAt: string
): Promise<WorkCredentialWithDeworkTaskId> => {
  const crdl: WorkCredential = await signAndCreateWorkCRDL(
    subject,
    provider,
    signer,
    createdAt
  );
  return { taskId, crdl };
};

export const createWorkCRDLs = async (
  subjects: WorkSubject[]
): Promise<WorkCredential[]> => {
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const provider = new providers.AlchemyProvider("homestead", ALCHEMY_API_KEY);
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signer = wallet.connect(provider);
  const nowTimestamp = convertDateToTimestampStr(new Date());

  const crdlPromises: Promise<WorkCredential>[] = [];

  for (const subject of subjects) {
    const crdlPromise = signAndCreateWorkCRDL(
      subject,
      provider,
      signer,
      nowTimestamp
    );
    crdlPromises.push(crdlPromise);
  }
  return await Promise.all(crdlPromises);
};

export const signAndCreateWorkCRDL = async (
  subject: WorkSubject,
  provider: ethers.providers.AlchemyProvider,
  signer: ethers.Wallet,
  createdAt: string
): Promise<WorkCredential> => {
  if (!subject.work) {
    throw new Error("Missing work subject");
  }
  const agentSig = await getEIP712WorkCredentialSubjectSignature(
    subject,
    provider,
    signer
  );

  const signature: Signatures = {
    holderSig: "",
    partnerSig: "",
    partnerSigner: "",
    agentSig: agentSig,
    agentSigner: getPkhDIDFromAddress(signer.address),
  };

  const crdl: WorkCredential = {
    id: subject.work.id,
    subject,
    signature,
    createdAt: createdAt,
    updatedAt: createdAt,
  };
  return crdl;
};

export const getEIP712WorkCredentialSubjectSignature = async (
  subject: WorkSubject,
  provider: ethers.providers.AlchemyProvider,
  signer: ethers.Wallet
): Promise<string> => {
  const { chainId } = await provider.getNetwork();
  const domain: EIP712DomainTypedData = {
    name: "Work Credential",
    version: "1",
    chainId: chainId,
    verifyingContract: "0x00000000000000000000000000000000000000000000", // WIP
  };
  const credentialTypedData = getEIP712WorkSubjectTypedData(domain, subject);
  const privateKey = Buffer.from(signer.privateKey.substring(2, 66), "hex");
  const signature = signTypedData({
    privateKey: privateKey,
    data: credentialTypedData,
    version: SignTypedDataVersion.V4,
  });
  console.log("signature", signature);
  return signature;
};

const getEIP712WorkSubjectTypedData = (
  domain: EIP712DomainTypedData,
  subject: WorkSubject
): EIP712WorkCredentialSubjectTypedData => {
  return {
    domain: domain,
    primaryType: PRIMARY_SUBJECT_TYPE,
    message: subject,
    types: {
      EIP712Domain: DOMAIN_TYPE,
      WorkCredentialSubject: WORK_SUBJECT_EIP712_TYPE,
      Work: WORK_EIP712_TYPE,
      DeliverableItem: DELIVERABLES_EIP712_TYPE,
      TX: TX_EIP712_TYPE,
      Client: CLIENT_EIP712_TYPE,
    },
  };
};

const convertValidworkSubjectTypedData = (
  subject: WorkSubject
): WorkSubject => {
  const deliverables: DeliverableItem[] = subject.deliverables
    ? subject.deliverables?.map((v) => {
        return castUndifined2DefaultValue(v, DELIVERABLES_EIP712_TYPE);
      })
    : [];

  return {
    work: castUndifined2DefaultValue(subject.work, WORK_EIP712_TYPE),
    tx: castUndifined2DefaultValue(subject.tx, TX_EIP712_TYPE),
    client: castUndifined2DefaultValue(subject.client, CLIENT_EIP712_TYPE),
    deliverables: deliverables,
  };
};

// Event Attendance
export const createEventAttendanceCredentials = async (
  event: EventWithId,
  dids: string[]
): Promise<EventAttendanceVerifiableCredential[]> => {
  const PRIVATE_KEY = process.env.PROXY_PRIVATE_KEY;
  const ALCHEMY_API_KEY = process.env.ALCHEMY_KEY;
  if (!PRIVATE_KEY || !ALCHEMY_API_KEY) {
    throw new Error("Missing agent private key");
  }
  const provider = new providers.AlchemyProvider("homestead", ALCHEMY_API_KEY);
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signer = wallet.connect(provider);
  let issuanceDate = Date.now();
  let expirationDate = new Date();
  expirationDate.setFullYear(expirationDate.getFullYear() + 100);

  const issuanceDateStr = new Date(issuanceDate).toISOString();
  const expirationDateStr = new Date(expirationDate).toISOString();

  const issuePromises: Promise<EventAttendanceVerifiableCredential>[] = [];

  for (const did of dids) {
    const content: EventAttendance = {
      id: did,
      eventId: event.ceramicId,
      eventName: event.name,
      eventIcon: event.icon,
    };
    const issuePromise = createEventAttendanceCredential(
      content,
      issuanceDateStr,
      expirationDateStr,
      provider,
      signer
    );
    issuePromises.push(issuePromise);
  }
  return await Promise.all(issuePromises);
};
export const createEventAttendanceCredential = async (
  eventAttendance: EventAttendance,
  issuanceDate: string,
  expirationDate: string,
  provider: ethers.providers.AlchemyProvider,
  signer: ethers.Wallet
): Promise<EventAttendanceVerifiableCredential> => {
  if (!provider) throw "Missing provider for getSignature";

  const credentialId = `${eventAttendance.eventId}-${eventAttendance.id}`;
  const address = await signer.getAddress();
  const issuerDID = getPkhDIDFromAddress(address);

  let credential: W3CCredential = {
    "@context": [DEFAULT_CONTEXT, EIP712_CONTEXT],
    type: [DEFAULT_VC_TYPE, EVENT_ATTENDANCE_VC_TYPE],
    id: credentialId,
    issuer: {
      id: issuerDID,
      ethereumAddress: address,
    },
    credentialSubject: eventAttendance,
    credentialSchema: {
      id: "https://app.vess.id/schemas/EventAttendance.json",
      type: "Eip712SchemaValidator2021",
    },
    issuanceDate: issuanceDate,
    expirationDate: expirationDate,
  };

  const domain: EIP712DomainTypedData = {
    name: "Verifiable Event Attendance",
    version: "1",
    chainId: provider.network.chainId,
    verifyingContract: "0x00000000000000000000000000000000000000000000", // WIP
  };

  const vc: VerifiableCredential = await createEIP712VerifiableCredential(
    domain,
    credential,
    { CredentialSubject: EVENT_ATTENDANCE_EIP712_TYPE },
    async (data: EIP712TypedData<EIP712MessageTypes>) => {
      const privateKey = Buffer.from(signer.privateKey.substring(2, 66), "hex");
      const sig = signTypedData({
        privateKey: privateKey,
        data: data,
        version: SignTypedDataVersion.V4,
      });
      return sig;
    }
  );
  return vc as EventAttendanceVerifiableCredential;
};
