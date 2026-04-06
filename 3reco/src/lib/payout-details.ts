export const bankAccountTypes = [
  'Cheque',
  'Savings',
  'Transmission',
] as const;

export const collectorPayoutMethods = ['bank', 'ewallet'] as const;

export type CollectorPayoutMethod = (typeof collectorPayoutMethods)[number];
export type BankAccountType = (typeof bankAccountTypes)[number];

export type CollectorPayoutFields = {
  payoutMethod?: CollectorPayoutMethod;
  bankAccountHolderName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
  bankAccountType?: BankAccountType;
  ewalletPlatformName?: string;
  ewalletPaymentId?: string;
};

export type CollectorBankPayoutDetails = {
  payoutMethod: 'bank';
  bankAccountHolderName: string;
  bankName: string;
  bankAccountNumber: string;
  bankBranchCode: string;
  bankAccountType: BankAccountType;
};

export type CollectorEwalletPayoutDetails = {
  payoutMethod: 'ewallet';
  ewalletPlatformName: string;
  ewalletPaymentId: string;
};

export type CollectorPayoutDetails =
  | CollectorBankPayoutDetails
  | CollectorEwalletPayoutDetails;

export const collectorBankFieldNames = [
  'bankAccountHolderName',
  'bankName',
  'bankAccountNumber',
  'bankBranchCode',
  'bankAccountType',
] as const satisfies readonly (keyof CollectorPayoutFields)[];

export const collectorEwalletFieldNames = [
  'ewalletPlatformName',
  'ewalletPaymentId',
] as const satisfies readonly (keyof CollectorPayoutFields)[];

const collectorPayoutFieldLabels: Record<
  Exclude<keyof CollectorPayoutFields, 'payoutMethod'>,
  string
> = {
  bankAccountHolderName: 'account holder name',
  bankName: 'bank name',
  bankAccountNumber: 'account number',
  bankBranchCode: 'branch code',
  bankAccountType: 'account type',
  ewalletPlatformName: 'ewallet platform name',
  ewalletPaymentId: 'payment ID',
};

export type CollectorPayoutValidationIssue = {
  field: keyof CollectorPayoutFields;
  message: string;
};

export function hasPayoutTextValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isBankAccountType(value: string | null | undefined): value is BankAccountType {
  return typeof value === 'string' && bankAccountTypes.includes(value as BankAccountType);
}

export function inferCollectorPayoutMethod(
  values: CollectorPayoutFields | null | undefined
) {
  if (values?.payoutMethod) {
    return values.payoutMethod;
  }

  const hasCompleteBankDetails = collectorBankFieldNames.every((fieldName) =>
    hasPayoutTextValue(values?.[fieldName])
  );

  if (hasCompleteBankDetails) {
    return 'bank' as const;
  }

  const hasCompleteEwalletDetails = collectorEwalletFieldNames.every((fieldName) =>
    hasPayoutTextValue(values?.[fieldName])
  );

  if (hasCompleteEwalletDetails) {
    return 'ewallet' as const;
  }

  return undefined;
}

export function getCollectorPayoutValidationIssues(
  values: CollectorPayoutFields
): CollectorPayoutValidationIssue[] {
  const issues: CollectorPayoutValidationIssue[] = [];
  const bankValuesProvided = collectorBankFieldNames.some((fieldName) =>
    hasPayoutTextValue(values[fieldName])
  );
  const ewalletValuesProvided = collectorEwalletFieldNames.some((fieldName) =>
    hasPayoutTextValue(values[fieldName])
  );

  if (!values.payoutMethod) {
    if (bankValuesProvided || ewalletValuesProvided) {
      issues.push({
        field: 'payoutMethod',
        message: 'Select a payout method or clear the payout details.',
      });
    }

    return issues;
  }

  if (values.payoutMethod === 'bank') {
    if (ewalletValuesProvided) {
      issues.push({
        field: 'payoutMethod',
        message: 'Clear the ewallet details or switch the payout method to ewallet.',
      });
    }

    for (const fieldName of collectorBankFieldNames) {
      if (!hasPayoutTextValue(values[fieldName])) {
        issues.push({
          field: fieldName,
          message: `Please provide the ${collectorPayoutFieldLabels[fieldName]}.`,
        });
      }
    }

    return issues;
  }

  if (bankValuesProvided) {
    issues.push({
      field: 'payoutMethod',
      message: 'Clear the bank details or switch the payout method to bank.',
    });
  }

  for (const fieldName of collectorEwalletFieldNames) {
    if (!hasPayoutTextValue(values[fieldName])) {
      issues.push({
        field: fieldName,
        message: `Please provide the ${collectorPayoutFieldLabels[fieldName]}.`,
      });
    }
  }

  return issues;
}

export function getCollectorPayoutDetails(
  values: CollectorPayoutFields | null | undefined
): CollectorPayoutDetails | undefined {
  const payoutMethod = inferCollectorPayoutMethod(values);

  if (payoutMethod === 'bank') {
    const [
      bankAccountHolderName,
      bankName,
      bankAccountNumber,
      bankBranchCode,
      bankAccountType,
    ] = collectorBankFieldNames.map((fieldName) => values?.[fieldName]);

    if (
      !hasPayoutTextValue(bankAccountHolderName) ||
      !hasPayoutTextValue(bankName) ||
      !hasPayoutTextValue(bankAccountNumber) ||
      !hasPayoutTextValue(bankBranchCode) ||
      !isBankAccountType(bankAccountType)
    ) {
      return undefined;
    }

    return {
      payoutMethod,
      bankAccountHolderName,
      bankName,
      bankAccountNumber,
      bankBranchCode,
      bankAccountType,
    };
  }

  if (payoutMethod === 'ewallet') {
    const { ewalletPlatformName, ewalletPaymentId } = values ?? {};

    if (
      !hasPayoutTextValue(ewalletPlatformName) ||
      !hasPayoutTextValue(ewalletPaymentId)
    ) {
      return undefined;
    }

    return {
      payoutMethod,
      ewalletPlatformName,
      ewalletPaymentId,
    };
  }

  return undefined;
}

export function getCollectorPayoutRows(
  payoutDetails: CollectorPayoutDetails | undefined
) {
  if (!payoutDetails) {
    return [];
  }

  if (payoutDetails.payoutMethod === 'bank') {
    return [
      ['Payout method', 'Bank transfer'],
      ['Account holder', payoutDetails.bankAccountHolderName],
      ['Bank name', payoutDetails.bankName],
      ['Account number', payoutDetails.bankAccountNumber],
      ['Branch code', payoutDetails.bankBranchCode],
      ['Account type', payoutDetails.bankAccountType],
    ] as const;
  }

  return [
    ['Payout method', 'Ewallet'],
    ['Platform', payoutDetails.ewalletPlatformName],
    ['Payment ID', payoutDetails.ewalletPaymentId],
  ] as const;
}

export function formatCollectorPayoutSummary(
  payoutDetails: CollectorPayoutDetails | undefined
) {
  return getCollectorPayoutRows(payoutDetails)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}
