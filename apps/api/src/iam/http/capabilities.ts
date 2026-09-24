/**
 * Injection tokens of IAM's bound capabilities (IAM-R07 D-01). The controllers see only these
 * capability interfaces; the composition roots beside this directory bind them to adapters.
 */
export type { IamAdministration } from '../administration.js';
export type { IamDirectory } from '../directory.js';
export type { IamUserAdministration } from '../user-administration.js';

export const IAM_ADMINISTRATION = Symbol('IAM_ADMINISTRATION');
export const IAM_USER_ADMINISTRATION = Symbol('IAM_USER_ADMINISTRATION');
export const IAM_DIRECTORY = Symbol('IAM_DIRECTORY');
