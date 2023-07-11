// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {Roles} from "../libraries/Roles.sol";

contract EpochsManager is IEpochsManager, Initializable, UUPSUpgradeable, AccessControlEnumerableUpgradeable {
    uint256 private _epochDuration;
    uint256 private _startFirstEpochTimestamp;

    function initialize(uint256 epochDuration_) public initializer {
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _epochDuration = epochDuration_;
        _startFirstEpochTimestamp = block.timestamp;
    }

    /// @inheritdoc IEpochsManager
    function currentEpoch() external view returns (uint16) {
        return uint16((block.timestamp - _startFirstEpochTimestamp) / _epochDuration);
    }

    /// @inheritdoc IEpochsManager
    function epochDuration() external view returns (uint256) {
        return _epochDuration;
    }

    /// @inheritdoc IEpochsManager
    function startFirstEpochTimestamp() external view returns (uint256) {
        return _startFirstEpochTimestamp;
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}
}
