export const ErrorInputCode = 1
export const ErrorInputMsg = `missing required parameter: `

export const ErrorDataNotExistCode = 2
export const ErrorDataNotExistMsg = `the data does not exist in the database: `

export const ErrorBusinessCode = 3
export const ErrorBusinessMsg = `business not allow: `

export const ErrorPermissionCode = 4
export const ErrorPermissionMsg = `permission check not allow: `

export const DelegateStatusDelegating = 0
export const DelegateStatusSuccess = 1
export const DelegateStatusFail = 2
export const DelegateStatusUndelegating = 3
export const DelegateStatusWithdrew = 4

export const RewardMaxDepth = 5
export const RewardMaxStar = 5

export const RewardTypePerson = 0
export const RewardTypeTeam = 1

export const RewardPersonKey = 'person_reward_level'
export const RewardTeamKey = 'team_reward_level'

export const RewardUnclaim = 0
export const RewardClaiming = 1
export const RewardClaimed = 2

export const MessageTypeCreateUser = 0
export const MessageTypeDelegate = 1
export const MessageTypeConfirmDelegate = 2
export const MessageTypeUndelegate = 3
export const MessageTypeConfirmUndelegate = 4
export const MessageTypeClaim = 5
export const MessageTypeConfirmClaim = 6
export const MessageTypePersonReward = 7
export const MessageTypeTeamReward = 8

export const ClaimStatusReceiving = 0
export const ClaimStatusReceived = 1
export const ClaimStatusReceiveFailed = 2

export const TokenWei = 1000000
export const ReceiptFail = 0
