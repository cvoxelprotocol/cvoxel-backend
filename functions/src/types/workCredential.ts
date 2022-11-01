import { Event } from "../__generated__/types/Event.js";
import { EventAttendanceVerifiableCredential } from "../__generated__/types/EventAttendanceVerifiableCredential.js";
import { Membership } from "../__generated__/types/MemberShip.js";
import { Organization } from "../__generated__/types/Organization.js";
import { VerifiableWorkCredential } from "../__generated__/types/VerifiableWorkCredential.js";
import {
  Transaction,
  Work,
  WorkCredential,
  WorkSubject,
} from "../__generated__/types/WorkCredential.js";
import { VerifiableMembershipSubjectCredential } from "./eip712.js";

export type WorkCredentialWithId = WorkCredential & {
  backupId?: string;
  holderDid?: string;
  potentialSigners?: string[];
};

export type WorkSubjectFromDework = WorkSubject & {
  streamId?: string | null;
  taskId?: string | null;
};

export type WorkCredentialForm = Work &
  Transaction & {
    deliverableLink?: string;
    deliverableCID?: string;
  };

export type VerifiableWorkCredentialWithId = VerifiableWorkCredential & {
  ceramicId: string;
};

export type OrganizationWIthId = Organization & {
  ceramicId: string;
};

export type MembershipWithId = Membership & {
  ceramicId: string;
};

export type MembershipSubjectWithId = VerifiableMembershipSubjectCredential & {
  ceramicId: string;
};

export type EventAttendanceWithId = EventAttendanceVerifiableCredential & {
  ceramicId: string;
};

export type EventWithId = Event & {
  ceramicId: string;
};

export type WorkCredentialWithDeworkTaskId = {
  taskId: string;
  crdl: WorkCredential;
};

const AliasType = {
  alsoKnownAs: "AlsoKnownAs",
  basicProfile: "BasicProfile",
  cryptoAccounts: "CryptoAccounts",
  workCredential: "WorkCredential",
  verifiableWorkCredential: "VerifiableWorkCredential",
  heldWorkCredentials: "HeldWorkCredentials",
  OldWorkCredential: "OldWorkCredential",
  OldWorkCredentials: "OldWorkCredentials",
  heldVerifiableWorkCredentials: "HeldVerifiableWorkCredentials",
  Organization: "Organization",
  MemberShip: "MemberShip",
  Event: "Event",
  IssuedEvents: "IssuedEvents",
  MembershipSubject: "MembershipSubject",
  EventAttendanceVerifiableCredential: "EventAttendanceVerifiableCredential",
  IssuedEventAttendanceVerifiableCredentials:
    "IssuedEventAttendanceVerifiableCredentials",
  HeldEventAttendanceVerifiableCredentials:
    "HeldEventAttendanceVerifiableCredentials",
  CreatedOrganizations: "CreatedOrganizations",
  CreatedMemberships: "CreatedMemberships",
  CreatedMembershipSubjects: "CreatedMembershipSubjects",
  VerifiableMembershipSubjectCredential:
    "VerifiableMembershipSubjectCredential",
  HeldVerifiableMembershipSubjects: "HeldVerifiableMembershipSubjects",
  IssuedVerifiableMembershipSubjects: "IssuedVerifiableMembershipSubjects",
} as const;
export type AliasTypes = typeof AliasType[keyof typeof AliasType];
