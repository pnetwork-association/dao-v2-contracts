// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {Roles} from "../libraries/Roles.sol";

contract EpochsManager is
    IEpochsManager,
    Initializable,
    UUPSUpgradeable,
    AccessControlEnumerableUpgradeable,
    OwnableUpgradeable
{
    uint256 private _epochDuration;
    uint256 private _startFirstEpochDate;

    function initialize(uint256 epochDuration_) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _epochDuration = epochDuration_;
        _startFirstEpochDate = block.timestamp;
    }

    /// @inheritdoc IEpochsManager
    function currentEpoch() external view returns (uint256) {
        return (block.timestamp - _startFirstEpochDate) / _epochDuration;
    }

    /// @inheritdoc IEpochsManager
    function epochDuration() external view returns (uint256) {
        return _epochDuration;
    }

    /// @inheritdoc IEpochsManager
    function startFirstEpochDate() external view returns (uint256) {
        return _startFirstEpochDate;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
