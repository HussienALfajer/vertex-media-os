# Vertex OS — Product Definition

**Status:** V1 Baseline
**Scope:** Vertex OS V1
**Product Owner:** Vertex Media

---

## 1. Document Role

This document is the canonical product-level definition of Vertex OS.

It defines:

* what Vertex OS is,
* why it exists,
* who it serves,
* the business problems it solves,
* the intended operational lifecycle,
* the capabilities included in V1,
* product-level requirements,
* product invariants,
* explicit scope boundaries,
* and the conditions under which V1 can be considered successful.

This document defines **what the product must accomplish and why**.

It does not define:

* software architecture,
* database schemas,
* APIs,
* infrastructure,
* deployment,
* implementation technologies,
* source-code organization,
* detailed authorization matrices,
* detailed UI components,
* or engineering conventions.

Those concerns belong to their respective architecture, module, engineering, security, UI, testing, and execution documents.

Normative keywords such as **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are used deliberately to express requirement strength.

---

## 2. Product Definition

Vertex OS is the internal operating platform of Vertex Media.

Its purpose is to provide one coherent system for managing the operational lifecycle of the company's commercial and delivery work.

Vertex OS connects customer acquisition, sales, project execution, internal collaboration, creative production, approvals, operational finance, automation, and management visibility.

The product is intended primarily for Vertex Media staff and management.

V1 focuses on internal company operations.

Vertex OS is not intended to become a full enterprise resource planning system in V1.

The canonical high-level lifecycle is:

`Lead → Opportunity → Proposal → Contract → Project → Brief → Tasks → Work → Review → Approval → Invoice → Payment → Completion`

Not every engagement is required to use every stage, but the product MUST preserve the relationships between stages that are used.

---

## 3. Problem and Purpose

Vertex Media operates across multiple disciplines, including management, internal operations, public relations, marketing, content, design, photography and video, software, communications, and consulting.

Without a shared operational system, work can become fragmented across conversations, documents, spreadsheets, files, personal task lists, and disconnected tools.

This creates several recurring business problems.

### 3.1 Fragmented customer information

Information about prospects and clients can become distributed across different people and tools.

The organization needs a reliable place to understand:

* who the client is,
* who the relevant contacts are,
* what commercial opportunities exist,
* what was proposed,
* what was agreed,
* and what work is currently being delivered.

### 3.2 Disconnect between sales and delivery

Commercial commitments must remain connected to the work required to fulfill them.

The system should prevent situations where a proposal, contract, project, tasks, deliverables, and invoices exist as unrelated records with no clear operational relationship.

### 3.3 Unclear ownership

At any meaningful stage of work, the organization needs to know:

* who owns the work,
* who is responsible for the next action,
* what is blocked,
* what is overdue,
* and what requires a decision.

### 3.4 Weak approval traceability

Creative and professional work often passes through multiple internal and client review cycles.

The organization needs to know:

* which version was reviewed,
* who reviewed it,
* what decision was made,
* what changes were requested,
* and which version ultimately became approved.

### 3.5 Version and asset confusion

Files and deliverables can evolve through many revisions.

The product must make it possible to distinguish current work from historical versions without destroying the history needed to understand prior decisions.

### 3.6 Limited workload visibility

Management and project owners need to understand how work is distributed across people and teams.

Assignments, estimates, deadlines, and recorded effort should contribute to a clearer picture of operational capacity and workload.

### 3.7 Limited financial visibility

Vertex Media needs operational financial visibility without requiring V1 to become a complete accounting platform.

The company needs to understand:

* what was quoted,
* what was invoiced,
* what has been paid,
* what remains outstanding,
* which direct expenses belong to a project,
* and the basic financial position of active engagements.

### 3.8 Repetitive manual coordination

Predictable operational actions should not always depend on someone remembering to perform them manually.

Vertex OS should automate repeatable operational transitions where doing so is reliable, understandable, and controllable.

### 3.9 Limited management visibility

Management needs consolidated visibility into:

* sales activity,
* active projects,
* deadlines,
* approvals,
* workload,
* invoices,
* payments,
* outstanding balances,
* operational risks,
* and important exceptions.

---

## 4. Product Goals

### G-01 — Establish an operational source of truth

Vertex OS SHOULD become the primary internal source of truth for the operational lifecycle of Vertex Media's client work.

### G-02 — Connect commercial commitments to execution

The product MUST preserve traceability between what was sold and the work created to deliver it.

### G-03 — Make responsibility and state visible

Authorized users MUST be able to determine the current state, ownership, and next meaningful action for operational work relevant to them.

### G-04 — Preserve review and approval history

The product MUST provide reliable traceability for submissions, revisions, reviews, requested changes, and approvals.

### G-05 — Improve management visibility

The product SHOULD provide decision-useful visibility into sales, delivery, workload, deadlines, approvals, and operational financial status.

### G-06 — Reduce avoidable manual coordination

The product SHOULD automate predictable operational actions without obscuring responsibility or decision history.

### G-07 — Create a foundation for future expansion

V1 SHOULD establish coherent product concepts and workflows that can support future capabilities without requiring those future capabilities to be implemented prematurely.

---

## 5. Product Non-Goals

The following are not objectives of Vertex OS V1.

### NG-01 — Full ERP replacement

V1 is not intended to replace every administrative or enterprise system used by the company.

### NG-02 — Full accounting system

V1 is not intended to provide a complete general ledger, chart of accounts, double-entry accounting, statutory accounting, or complete tax-accounting system.

### NG-03 — Full HR and payroll platform

V1 is not intended to provide a complete human-resources or payroll suite.

### NG-04 — Social publishing platform

V1 is not intended to replace dedicated social-media publishing and advertising platforms.

### NG-05 — Autonomous business decision-maker

Automation may assist operations, but V1 is not intended to delegate authoritative commercial, financial, contractual, or approval decisions to autonomous AI agents.

### NG-06 — External client self-service platform

The primary V1 product is an internal company system rather than a complete external client portal.

### NG-07 — Feature completeness for hypothetical future needs

V1 is not intended to implement capabilities solely because they may become useful later.

---

## 6. Users and Operating Context

Vertex OS serves multiple operational groups within Vertex Media.

A person may perform more than one role, and specific access rights are defined outside this document.

### 6.1 Leadership and General Management

Leadership needs a consolidated view of company operations.

Primary needs include:

* business visibility,
* major commercial activity,
* project health,
* operational bottlenecks,
* workload,
* financial status,
* overdue items,
* and significant exceptions.

### 6.2 Internal Operations

Operations coordinates work across teams and processes.

Primary needs include:

* tracking active work,
* coordinating responsibilities,
* monitoring deadlines,
* identifying blockers,
* following approvals,
* and maintaining operational continuity.

### 6.3 Public Relations and Sales

Commercial teams manage prospective and existing client relationships.

Primary needs include:

* leads,
* contacts,
* opportunities,
* activity history,
* proposals,
* quotations,
* contracts,
* and commercial follow-up.

### 6.4 Project Management

Project owners coordinate delivery against commercial commitments.

Primary needs include:

* scope visibility,
* project phases,
* milestones,
* assignments,
* deadlines,
* briefs,
* tasks,
* deliverables,
* reviews,
* approvals,
* and project status.

### 6.5 Marketing and Content

Marketing and content teams plan and produce campaigns and content.

Primary needs include:

* briefs,
* campaign context,
* content planning,
* content calendar visibility,
* assignments,
* assets,
* reviews,
* approvals,
* and delivery status.

### 6.6 Design

Design teams need structured creative work with clear inputs and revision history.

Primary needs include:

* briefs,
* tasks,
* references,
* files,
* versions,
* feedback,
* revisions,
* and approvals.

### 6.7 Photography and Video

Photography and video teams coordinate production work and associated deliverables.

Primary needs include:

* production briefs,
* assignments,
* schedules,
* assets,
* revisions,
* approvals,
* and delivery status.

### 6.8 Software

Software teams manage client software engagements through the same broader project lifecycle while retaining the ability to model software-specific work.

Primary needs include:

* requirements and briefs,
* project context,
* work assignments,
* dependencies,
* files,
* reviews,
* approvals,
* and delivery milestones.

### 6.9 General Communications

Communications work may participate in client, campaign, project, and content workflows.

Primary needs include:

* communication context,
* assigned work,
* campaign or project relationships,
* files,
* approvals,
* and deadlines.

### 6.10 Medical Consulting

Medical consulting work may require professional briefs, project coordination, content, files, reviews, approvals, and client-related workflows.

The product should support this operational model without requiring a separate disconnected platform.

### 6.11 Finance Operations

Authorized finance-related users need visibility into the operational financial lifecycle.

Primary needs include:

* quotations,
* invoices,
* payments,
* direct project expenses,
* outstanding balances,
* and financial status associated with client work.

### 6.12 System Administration

Authorized administrators manage the organizational and access foundations required for staff to use Vertex OS safely.

---

## 7. Product Principles

### PP-01 — One operational truth

Important operational information SHOULD have one authoritative representation rather than multiple competing copies.

### PP-02 — Workflow over isolated records

Records should express meaningful business relationships and lifecycle progression rather than exist as disconnected data.

### PP-03 — Explicit ownership

Operational work SHOULD make ownership and responsibility clear.

### PP-04 — Traceable decisions

Important commercial, approval, financial, and operational decisions MUST remain attributable.

### PP-05 — History over destructive replacement

Where historical context affects accountability or understanding, the system SHOULD preserve history instead of silently replacing it.

### PP-06 — Human control over automation

Automation SHOULD reduce repetitive coordination while keeping important decisions understandable and attributable to people.

### PP-07 — Progressive complexity

Simple workflows should remain simple.

Additional complexity should appear only when the business process actually requires it.

### PP-08 — Operational clarity before feature richness

V1 SHOULD prioritize reliable end-to-end operations over a larger number of partially integrated features.

### PP-09 — Financial clarity

Commercial value, invoicing, payment, expenses, and outstanding balances MUST remain conceptually distinct.

### PP-10 — Consistent terminology

The same business concept SHOULD use the same canonical terminology throughout the product.

---

## 8. Canonical Business Lifecycle

The following lifecycle describes the primary commercial-to-delivery flow.

It is a product model, not a requirement that every engagement pass through every stage.

### 8.1 Lead

A lead represents a potential business relationship or commercial interest that has not yet become a qualified engagement.

A lead MAY be disqualified, retained for future follow-up, or progressed toward an opportunity.

A lead does not automatically become a client merely because a record exists.

### 8.2 Opportunity

An opportunity represents a qualified potential commercial engagement.

It connects commercial intent to a prospective or existing client context.

An opportunity MAY lead to one or more commercial proposals.

### 8.3 Proposal and Quotation

A proposal describes a proposed engagement, solution, scope, or commercial offer.

A quotation expresses the commercial pricing associated with proposed work.

Commercial revisions MUST remain distinguishable when the historical difference matters.

An accepted proposal or quotation does not, by itself, imply payment.

### 8.4 Contract

Where a formal contract is used, it records the agreed commercial relationship and commitments governing the engagement.

The product MUST preserve the relationship between the applicable commercial agreement and resulting work.

### 8.5 Project

A project represents coordinated delivery work performed for an engagement.

A project may contain:

* services,
* phases,
* milestones,
* team members,
* briefs,
* tasks,
* assets,
* approvals,
* financial relationships,
* and activity history.

### 8.6 Brief

A brief captures structured context and expectations needed to perform work correctly.

Different forms of work may require different brief structures.

A brief SHOULD reduce repeated clarification and make the agreed working context discoverable.

### 8.7 Tasks and Execution

Tasks represent actionable work.

Tasks may include:

* ownership,
* due dates,
* priorities,
* subtasks,
* dependencies,
* progress states,
* comments,
* and related files.

Execution may occur across multiple departments and disciplines.

### 8.8 Review

Work may require internal or external review before acceptance.

A review is not equivalent to approval.

Feedback and requested changes SHOULD remain traceable to the reviewed work where that history matters.

### 8.9 Approval

Approval records an authorized decision about a specific submitted item or version.

Approval MAY be internal, client-facing, managerial, financial, or another defined business approval type.

Approval history MUST not become ambiguous when later revisions are created.

### 8.10 Invoice

An invoice represents an amount billed.

Issuing an invoice does not imply that money has been received.

### 8.11 Payment

A payment represents money received against an applicable financial obligation.

Payment and invoice state MUST remain distinct concepts.

### 8.12 Completion

Operational completion indicates that the applicable delivery work has reached its defined completion state.

Project completion and financial settlement MAY occur at different times and MUST remain distinguishable.

---

## 9. Canonical End-to-End Journeys

These journeys represent the most important cross-product flows V1 must support coherently.

### J-01 — New Client Engagement

`Lead → Qualification → Opportunity → Proposal/Quotation → Acceptance → Contract when applicable → Project`

Core client and commercial information SHOULD carry forward without unnecessary duplicate entry.

### J-02 — Creative Deliverable

`Brief → Task → Work → Asset Version → Internal Review → Client Review when applicable → Revision or Approval`

The organization MUST be able to understand which version was reviewed and what happened next.

### J-03 — Project Delivery

`Project → Team → Phases/Milestones → Tasks → Dependencies → Work → Review → Completion`

Project owners SHOULD be able to determine current status, ownership, deadlines, and blockers.

### J-04 — Operational Billing

`Commercial Commitment → Invoice → Payment → Allocation → Outstanding Balance`

The system MUST distinguish billed, paid, and outstanding amounts.

### J-05 — Content Operations

`Campaign/Plan → Content Item → Brief → Production → Review → Approval → Scheduled/Published Status`

V1 may track publication status without directly publishing content to external platforms.

### J-06 — Operational Automation

`Business Event → Applicable Conditions → Controlled Actions → Result History`

Automated execution SHOULD remain observable and traceable.

---

## 10. V1 Capability Map

### 10.1 Identity, Organization, and Access

Manage internal users, organizational structure, roles, and authorized access required to use Vertex OS.

### 10.2 CRM

Manage leads, clients, contacts, opportunities, and meaningful commercial activity history.

### 10.3 Service Catalog

Maintain the services Vertex Media offers and the shared service context used across sales and delivery.

### 10.4 Proposals and Quotations

Create and manage commercial proposals, quotations, revisions, statuses, and acceptance outcomes.

### 10.5 Contracts

Record and manage contracts and their relationship to the applicable client, commercial agreement, and resulting work.

### 10.6 Projects

Coordinate client delivery through projects, phases, milestones, services, team participation, status, and related operational records.

### 10.7 Tasks

Manage operational work through tasks, subtasks, assignments, priorities, dependencies, deadlines, and progress.

### 10.8 Briefs

Capture structured working context appropriate to different types of services and deliverables.

### 10.9 Files and Assets

Organize operational files and deliverables and preserve meaningful version relationships.

### 10.10 Approvals and Revisions

Manage internal and client-facing review, requested changes, revisions, and approvals with traceable history.

### 10.11 Content and Basic Campaign Operations

Plan content and campaigns, coordinate production, track approval state, and maintain a content calendar.

### 10.12 Time Tracking

Record work effort associated with relevant projects and tasks.

### 10.13 Resource and Workload Visibility

Provide operational visibility into assignments, planned effort, and team workload where sufficient data exists.

### 10.14 Operational Finance

Manage quotations, invoices, payments, payment allocation, direct project expenses, and outstanding balances required for operational visibility.

### 10.15 Collaboration

Support comments, mentions, contextual discussion, and relevant file attachments around operational work.

### 10.16 Notifications

Inform users of relevant assignments, requests, deadlines, mentions, approvals, and operational events.

### 10.17 Automation

Allow predictable operational events to trigger defined conditions and actions while preserving execution history.

### 10.18 Dashboards and Reporting

Provide role-appropriate operational visibility into sales, projects, deadlines, workload, approvals, finance, and management indicators.

### 10.19 Auditability

Preserve the history required to understand significant protected, commercial, financial, administrative, and approval-related changes.

---

## 11. Core Product Requirements

### PR-001 — Unified client context

Vertex OS MUST provide an authoritative internal representation of clients and relevant client contacts.

### PR-002 — Lead management

Vertex OS MUST allow authorized users to record, progress, qualify, and close leads.

### PR-003 — Opportunity management

Vertex OS MUST support qualified commercial opportunities associated with prospective or existing client relationships.

### PR-004 — Commercial history

Vertex OS MUST preserve sufficient commercial history to understand significant proposals, quotations, revisions, and acceptance outcomes.

### PR-005 — Sales-to-delivery traceability

Vertex OS MUST maintain traceable relationships between accepted commercial commitments and the delivery work created from them.

### PR-006 — Service context

Vertex OS MUST provide a shared representation of the services sold and delivered by Vertex Media.

### PR-007 — Project ownership

Vertex OS MUST make responsibility for active projects determinable by authorized users.

### PR-008 — Project state

Vertex OS MUST provide an authoritative current state for each active project.

### PR-009 — Work ownership

Vertex OS MUST allow actionable work to be assigned to responsible users where assignment is applicable.

### PR-010 — Task relationships

Vertex OS MUST support work relationships required to represent subtasks and dependencies.

### PR-011 — Deadlines

Vertex OS MUST allow time-sensitive operational work to carry deadlines or due dates where applicable.

### PR-012 — Briefs

Vertex OS MUST support structured briefs that provide working context appropriate to different service types.

### PR-013 — File relationships

Vertex OS MUST allow files and assets to be associated with the operational records they support.

### PR-014 — Version distinction

Vertex OS MUST preserve meaningful distinctions between asset or deliverable versions when revision history is required.

### PR-015 — Review history

Vertex OS MUST preserve sufficient review history to understand important feedback and requested changes.

### PR-016 — Approval traceability

Vertex OS MUST record approval decisions in a way that identifies the subject of the decision and the responsible decision-maker.

### PR-017 — Revision traceability

Vertex OS MUST allow a revision request to remain distinguishable from the approval that may follow it.

### PR-018 — Content planning

Vertex OS MUST provide a shared operational calendar for planned content work included in V1.

### PR-019 — Campaign context

Vertex OS MUST allow applicable content and work to be organized within basic campaign context.

### PR-020 — Time recording

Vertex OS MUST allow authorized users to record relevant work effort against applicable project or task context.

### PR-021 — Workload visibility

Vertex OS SHOULD provide workload visibility based on available assignments, expected effort, deadlines, and recorded work.

### PR-022 — Invoice management

Vertex OS MUST allow authorized users to record and manage invoices associated with applicable client work.

### PR-023 — Payment management

Vertex OS MUST allow authorized users to record payments separately from invoices.

### PR-024 — Payment allocation

Vertex OS MUST support determining how recorded payments apply to applicable financial obligations.

### PR-025 — Outstanding balances

Vertex OS MUST allow authorized users to determine outstanding operational balances from recorded invoice and payment information.

### PR-026 — Direct project expenses

Vertex OS MUST support recording direct expenses associated with relevant client or project work.

### PR-027 — Contextual collaboration

Vertex OS MUST allow relevant operational records to carry contextual internal collaboration where applicable.

### PR-028 — Mentions and notifications

Vertex OS SHOULD notify relevant users when they are explicitly mentioned, assigned, requested to review, or otherwise require operational attention.

### PR-029 — Activity traceability

Vertex OS SHOULD provide a meaningful activity history for important operational records.

### PR-030 — Controlled automation

Vertex OS MUST allow defined operational automation without making automated actions indistinguishable from human actions.

### PR-031 — Automation history

Vertex OS MUST preserve sufficient execution history to determine whether an automation ran and what outcome occurred.

### PR-032 — Management visibility

Vertex OS MUST provide management-level visibility into important operational states across sales, delivery, workload, approvals, and operational finance.

### PR-033 — Authorized access

Vertex OS MUST restrict protected information and actions to authorized users.

### PR-034 — Auditability

Vertex OS MUST preserve auditable history for actions whose business significance requires accountability.

### PR-035 — Consistent relationships

Vertex OS MUST preserve the meaningful relationships among clients, commercial commitments, projects, work, deliverables, approvals, and operational financial records.

### PR-036 — Distinct lifecycle states

Vertex OS MUST NOT treat proposal acceptance, project completion, invoice issuance, and payment receipt as equivalent business events.

---

## 12. Product-Level Invariants

### INV-001 — Approval subject identity

An approval decision MUST refer to an identifiable submitted subject or version.

### INV-002 — Approval history preservation

Creating a later revision MUST NOT rewrite a previous approval as though it never occurred.

### INV-003 — Revision distinction

A revision request and an approval decision MUST remain distinguishable events.

### INV-004 — Commercial acceptance attribution

Commercial acceptance MUST remain attributable to an identifiable agreement, proposal, quotation, contract, or equivalent commercial record.

### INV-005 — Sales-delivery relationship

Delivery work created from a commercial commitment MUST retain sufficient relationship to determine what commitment it fulfills.

### INV-006 — Invoice-payment distinction

An invoice MUST NOT be considered paid merely because it was issued.

### INV-007 — Original financial meaning

Recording a payment MUST NOT silently rewrite the original invoiced amount.

### INV-008 — Outstanding balance derivability

Where the required financial records exist, the outstanding balance MUST be derivable from authoritative recorded financial events.

### INV-009 — Historical accountability

History required to understand a significant commercial, financial, approval, security, or administrative action MUST NOT be silently rewritten to erase the previous state.

### INV-010 — Identity of actors

Actions requiring accountability MUST remain attributable to an identifiable actor or system process.

### INV-011 — Authorization

The existence of a record MUST NOT imply that every user is permitted to view or modify it.

### INV-012 — Automation attribution

Actions produced by automation MUST remain distinguishable from direct human actions where the distinction is operationally significant.

### INV-013 — Project and financial completion distinction

Operational project completion MUST NOT automatically imply that all financial obligations are settled.

### INV-014 — Client and lead distinction

A lead MUST NOT become an established client solely through creation of a lead record.

### INV-015 — Current state and history

The product MAY present a simplified current state, but doing so MUST NOT destroy historical information required by other product invariants.

---

## 13. V1 Scope Boundaries

### 13.1 In Scope

V1 includes the product capabilities necessary for:

* identity and authorized internal access,
* departments and organizational roles,
* CRM,
* leads,
* clients,
* contacts,
* opportunities,
* service catalog,
* proposals,
* quotations,
* contracts,
* projects,
* project phases and milestones,
* tasks,
* subtasks,
* task dependencies,
* briefs,
* files and assets,
* version tracking,
* internal approvals,
* client approvals recorded by internal users,
* revision requests,
* content planning,
* content calendar,
* basic campaign operations,
* time tracking,
* resource and workload visibility,
* operational invoices,
* payments,
* payment allocations,
* direct project expenses,
* outstanding balances,
* comments,
* mentions,
* notifications,
* activity history,
* controlled operational automation,
* dashboards,
* operational reporting,
* and audit history.

### 13.2 Explicitly Deferred

The following are outside V1 unless the product scope is explicitly changed:

* full general-ledger accounting,
* chart-of-accounts management,
* complete double-entry accounting,
* payroll,
* complete HR management,
* inventory,
* procurement,
* warehouse management,
* direct social-media publishing,
* Meta platform integrations,
* Google Ads integrations,
* TikTok integrations,
* full external client self-service portal,
* deep Vertex Media website integration,
* recruitment and applicant-management workflows,
* autonomous AI agents controlling authoritative business decisions,
* and other capabilities that do not directly support the V1 operational core.

Deferred does not mean rejected permanently.

It means the capability is not a requirement for V1.

---

## 14. Success Criteria

The following criteria describe product-level outcomes expected from a successful V1.

### SC-001 — Commercial continuity

An authorized user can trace a standard client engagement from its commercial origin to the project created to deliver it without relying on unrelated external records for the core relationship.

### SC-002 — Operational visibility

An authorized project owner can determine the current owner, state, deadline, and known blocking context of active operational work where those concepts apply.

### SC-003 — Approval clarity

For work requiring review and approval, an authorized user can determine what was submitted, what feedback or revision was requested, and what was ultimately approved.

### SC-004 — Financial clarity

An authorized user can distinguish quoted, invoiced, paid, directly expensed, and outstanding operational amounts for applicable work.

### SC-005 — Reduced duplicate entry

Core client and engagement information can flow through relevant stages of the business lifecycle without unnecessary manual re-entry of the same authoritative information.

### SC-006 — Management awareness

Leadership can obtain a consolidated view of significant sales, project, deadline, workload, approval, and operational financial conditions from Vertex OS.

### SC-007 — Controlled automation

Operational automation can perform defined repetitive actions while preserving understandable execution history and human accountability.

### SC-008 — Scope integrity

V1 can operate effectively without requiring implementation of the explicitly deferred ERP, publishing, advertising-platform, HR, payroll, or autonomous-AI capabilities.

### SC-009 — Cross-department usability

The core operating model can support Vertex Media's major departments without requiring independent disconnected systems for each department.

### SC-010 — Historical confidence

Authorized users can investigate significant prior commercial, delivery, approval, or financial events without discovering that required history was silently overwritten.

---

## 15. Assumptions and Constraints

### A-01

Vertex Media staff and management are the primary users of V1.

### A-02

V1 prioritizes internal operations over direct external client self-service.

### A-03

Different departments may require different working details while still sharing the same higher-level operational concepts.

### A-04

Not every client engagement follows every canonical lifecycle stage.

The product must support legitimate variation without losing traceability.

### A-05

Some services are creative, some technical, and some consulting-oriented.

The product should support these differences without fragmenting the organization into unrelated operating systems.

### A-06

Vertex Media may evolve its processes after V1.

The product should preserve clear business concepts without prematurely implementing speculative future requirements.

### A-07

Arabic operational content may be used throughout the organization.

Product concepts must not depend on English-only business data.

### A-08

External integrations may be introduced in later versions, but V1 workflows must remain useful without depending on integrations that have explicitly been deferred.

---

## 16. Glossary

### Activity

A meaningful recorded business or operational action associated with an entity.

### Approval

An authorized decision accepting a specific submitted subject or version.

### Asset

A file or deliverable associated with operational work.

### Brief

Structured context and requirements used to guide work.

### Campaign

A coordinated marketing or communication effort grouping related objectives, work, and content.

### Client

An established organization or party with whom Vertex Media has a recognized business relationship.

### Contact

An individual associated with a lead, client, or other relevant business relationship.

### Content Item

A planned or produced piece of content managed through the content workflow.

### Contract

A formal agreement governing an applicable commercial engagement.

### Deliverable

An identifiable output expected from project or service work.

### Direct Expense

An operational expense attributable directly to applicable client or project work.

### Invoice

A financial record stating an amount billed.

### Lead

A potential business relationship or commercial interest that has not yet become a qualified engagement or established client solely by virtue of the lead record.

### Milestone

A meaningful point or outcome within project delivery.

### Opportunity

A qualified potential commercial engagement with a prospective or existing client.

### Outstanding Balance

An amount that remains financially due, derived from authoritative invoice, payment, and payment-allocation records. It is a derived value, not an independently recorded amount.

### Payment

A recorded receipt of money against an applicable financial obligation.

### Project

A coordinated body of delivery work performed to fulfill applicable client commitments.

### Proposal

A structured commercial presentation of proposed work, scope, approach, or terms.

### Quotation

A commercial statement of pricing associated with proposed work.

### Review

An evaluation of submitted work that may produce feedback, requested changes, or an approval decision.

### Revision

A subsequent version or change created in response to feedback, correction, or evolving requirements.

### Revision Request

A decision indicating that changes are required before the reviewed subject can proceed.

### Service

A type of professional work offered by Vertex Media.

### Task

An actionable unit of work within an operational context.

### Workload

The operational demand placed on a person or team based on relevant assignments, expected effort, timing, and related work information.

---

## 17. Related Sources of Truth

This document owns product-level purpose, scope, terminology, requirements, and invariants.

Other concerns belong to separate authoritative documents.

* `AGENTS.md` — repository-wide operating rules for coding agents.
* `CLAUDE.md` — Claude Code entry instructions and reference to the shared agent contract.
* `docs/ARCHITECTURE.md` — technical architecture and system boundaries.
* `docs/MODULES.md` — detailed responsibilities and relationships of business modules.
* `docs/ENGINEERING.md` — engineering conventions and implementation standards.
* `docs/SECURITY.md` — security model and security requirements.
* `docs/TESTING.md` — testing strategy and verification standards.
* `docs/DESIGN_SYSTEM.md` — visual, interaction, content and accessibility language of the application UI.
* `docs/PLANNING.md` — mandatory planning, implementation, audit and delivery method for modules.
* `docs/adr/` — architecture decision records (canonical once accepted records exist).

When another document requires product scope, terminology, or product-level behavior, it SHOULD reference this document rather than duplicate it.

---

## 18. Change Discipline

`PRODUCT.md` represents the current accepted product truth, not a chronological changelog.

A change to this document is significant when it alters:

* V1 scope,
* a canonical business concept,
* a product requirement,
* a product invariant,
* a core lifecycle relationship,
* a product goal,
* or a product non-goal.

Such changes should be intentional and reviewed for their effect on existing specifications, architecture, implementation, tests, and operational behavior.

Git history should preserve document history.

This file should remain concise enough to serve as an effective product reference rather than becoming an encyclopedia of implementation detail.
