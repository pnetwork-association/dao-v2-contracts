const R = require('ramda')

const getRole = R.curry((_ethers, _message) => _ethers.keccak256(_ethers.toUtf8Bytes(_message)))
const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000'
const ROLES = [
  'BORROW_ROLE',
  'BURN_ROLE',
  'CHANGE_MAX_TOTAL_SUPPLY_ROLE',
  'CHANGE_TOKEN_ROLE',
  'CREATE_PAYMENTS_ROLE',
  'CREATE_VOTES_ROLE',
  'INCREASE_AMOUNT_ROLE',
  'INCREASE_DURATION_ROLE',
  'MINT_ROLE',
  'REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE',
  'RELEASE_ROLE',
  'SET_FEES_MANAGER_ROLE',
  'SET_FORWARDER_ROLE',
  'SET_GOVERNANCE_MESSAGE_EMITTER_ROLE',
  'SLASH_ROLE',
  'STAKE_ROLE',
  'TRANSFER_ROLE',
  'UPDATE_GUARDIAN_REGISTRATION_ROLE',
  'UPGRADE_ROLE',
  'DEPOSIT_REWARD_ROLE',
  'WITHDRAW_ROLE'
]

const getAllRoles = (_ethers) =>
  R.pipe(
    R.reduce((acc, currentValue) => R.assoc(currentValue, getRole(_ethers, currentValue), acc), {}),
    R.mergeLeft({ DEFAULT_ADMIN_ROLE })
  )(ROLES)

module.exports = {
  getAllRoles
}
