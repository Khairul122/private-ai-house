import type { ClientAutomation, Invoice, InvoiceIdentity, OutboxMessage, OwnerTask, ProgressNote, TeamBriefing } from '@fvh/domain';
import type { ClientProject, Payment } from './api.js';
export type OperationSignal={busy:boolean;lastRunAt:string|null;error:string|null;reason:string};
export type OperationsData={clients:ClientAutomation[];notes:ProgressNote[];tasks:OwnerTask[];invoices:Invoice[];identity:InvoiceIdentity|null;briefings:TeamBriefing[];messages:OutboxMessage[];projects:ClientProject[];payments:Payment[];runtime:{running:boolean;jobs:Record<string,OperationSignal>};whatsapp:{state:string;reason:string;provider:string}|null;google:{configured:boolean;connected:boolean;reason:string;redirectUri:string}|null};
