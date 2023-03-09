// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {BaseStakingManager} from "./BaseStakingManager.sol";
import {IStakingManager} from "../interfaces/IStakingManager.sol";
import {Roles} from "../libraries/Roles.sol";

contract StakingManager is IStakingManager, Initializable, UUPSUpgradeable, OwnableUpgradeable, BaseStakingManager {
    function initialize(address _token, address _tokenManager, address _forwarder) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();
        __BaseStakingManager_init(_token, _tokenManager);
        __ForwarderRecipientUpgradeable_init(_forwarder);

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /// @inheritdoc IStakingManager
    function stake(address receiver, uint256 amount, uint64 duration) external {
        _stake(receiver, amount, duration);
    }

    /// @inheritdoc IStakingManager
    function increaseDuration(uint64 duration) external {
        _increaseDuration(_msgSender(), duration);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
