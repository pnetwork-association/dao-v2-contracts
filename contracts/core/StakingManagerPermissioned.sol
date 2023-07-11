// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {BaseStakingManager} from "./BaseStakingManager.sol";
import {IStakingManagerPermissioned} from "../interfaces/IStakingManagerPermissioned.sol";
import {Roles} from "../libraries/Roles.sol";

contract StakingManagerPermissioned is IStakingManagerPermissioned, Initializable, UUPSUpgradeable, BaseStakingManager {
    function initialize(
        address _token,
        address _tokenManager,
        address _forwarder,
        uint256 _maxTotalSupply
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();
        __BaseStakingManager_init(_token, _tokenManager, _maxTotalSupply);
        __ForwarderRecipientUpgradeable_init(_forwarder);

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(SET_FORWARDER_ROLE, _msgSender());
    }

    /// @inheritdoc IStakingManagerPermissioned
    function stake(address receiver, uint256 amount, uint64 duration) external onlyRole(Roles.STAKE_ROLE) {
        _stake(receiver, amount, duration);
    }

    /// @inheritdoc IStakingManagerPermissioned
    function increaseDuration(address owner, uint64 duration) external onlyRole(Roles.INCREASE_DURATION_ROLE) {
        _increaseDuration(owner, duration);
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}
}
