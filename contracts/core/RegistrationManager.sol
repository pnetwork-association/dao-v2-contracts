// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ForwarderRecipientUpgradeable} from "../forwarder/ForwarderRecipientUpgradeable.sol";
import {IStakingManagerPermissioned} from "../interfaces/IStakingManagerPermissioned.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {ILendingManager} from "../interfaces/ILendingManager.sol";
import {IRegistrationManager} from "../interfaces/IRegistrationManager.sol";
import {Roles} from "../libraries/Roles.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries//Constants.sol";
import {Helpers} from "../libraries/Helpers.sol";

contract RegistrationManager is IRegistrationManager, Initializable, UUPSUpgradeable, ForwarderRecipientUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => Registration) private _sentinelRegistrations;
    mapping(address => address) private _ownersSentinel;

    uint24[] private _sentinelsEpochsTotalStakedAmount;
    mapping(address => uint24[]) private _sentinelsEpochsStakedAmount;

    address public stakingManager;
    address public token;
    address public epochsManager;
    address public lendingManager;

    //v1.1.0
    mapping(address => Registration) private _guardianRegistrations;
    mapping(address => address) private _ownersGuardian;
    mapping(uint16 => uint16) private _epochsTotalNumberOfGuardians;

    function initialize(
        address _token,
        address _stakingManager,
        address _epochsManager,
        address _lendingManager,
        address _forwarder
    ) public initializer {
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();
        __ForwarderRecipientUpgradeable_init(_forwarder);

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(SET_FORWARDER_ROLE, _msgSender());

        stakingManager = _stakingManager;
        token = _token;
        epochsManager = _epochsManager;
        lendingManager = _lendingManager;

        _sentinelsEpochsTotalStakedAmount = new uint24[](Constants.AVAILABLE_EPOCHS);
    }

    /// @inheritdoc IRegistrationManager
    function getSentinelAddressFromSignature(address owner, bytes calldata signature) public pure returns (address) {
        bytes32 message = ECDSA.toEthSignedMessageHash(keccak256(abi.encodePacked(owner)));
        return ECDSA.recover(message, signature);
    }

    /// @inheritdoc IRegistrationManager
    function guardianRegistration(address guardian) external view returns (Registration memory) {
        return _guardianRegistrations[guardian];
    }

    /// @inheritdoc IRegistrationManager
    function increaseSentinelRegistrationDuration(uint64 duration) external {
        _increaseSentinelRegistrationDuration(_msgSender(), duration);
    }

    /// @inheritdoc IRegistrationManager
    function increaseSentinelRegistrationDuration(address owner, uint64 duration) external onlyForwarder {
        _increaseSentinelRegistrationDuration(owner, duration);
    }

    /// @inheritdoc IRegistrationManager
    function sentinelRegistration(address sentinel) external view returns (Registration memory) {
        return _sentinelRegistrations[sentinel];
    }

    /// @inheritdoc IRegistrationManager
    function sentinelOf(address owner) external view returns (address) {
        return _ownersSentinel[owner];
    }

    /// @inheritdoc IRegistrationManager
    function releaseSentinel(address sentinel) external onlyRole(Roles.RELEASE_SENTINEL_ROLE) {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        Registration storage registration = _sentinelRegistrations[sentinel];
        uint16 registrationStartEpoch = registration.startEpoch;
        uint16 registrationEndEpoch = registration.endEpoch;
        bytes1 registrationKind = registration.kind;

        if (registrationEndEpoch < currentEpoch) revert Errors.SentinelNotReleasable(sentinel);

        for (uint16 epoch = currentEpoch; epoch <= registrationEndEpoch; ) {
            if (registrationKind == Constants.REGISTRATION_SENTINEL_BORROWING) {
                ILendingManager(lendingManager).release(
                    sentinel,
                    epoch,
                    Constants.BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION
                );
            }

            if (registrationKind == Constants.REGISTRATION_SENTINEL_STAKING) {
                uint24 sentinelEpochStakingAmount = _sentinelsEpochsStakedAmount[sentinel][epoch];
                delete _sentinelsEpochsStakedAmount[sentinel][epoch];
                _sentinelsEpochsTotalStakedAmount[epoch] -= sentinelEpochStakingAmount;
                // TODO: Should we slash the corresponding amount of tokens?
            }

            unchecked {
                ++epoch;
            }
        }

        if (currentEpoch == registrationStartEpoch) {
            delete _ownersSentinel[registration.owner];
            delete registration.owner;
            delete registration.startEpoch;
            delete registration.endEpoch;
            delete registration.kind;
        } else {
            registration.endEpoch = currentEpoch - 1;
        }

        emit SentinelReleased(sentinel, currentEpoch);
    }

    /// @inheritdoc IRegistrationManager
    function sentinelStakedAmountByEpochOf(address sentinel, uint16 epoch) external view returns (uint256) {
        return _sentinelsEpochsStakedAmount[sentinel].length > 0 ? _sentinelsEpochsStakedAmount[sentinel][epoch] : 0;
    }

    /// @inheritdoc IRegistrationManager
    function totalNumberOfGuardiansByEpoch(uint16 epoch) external view returns (uint16) {
        return _epochsTotalNumberOfGuardians[epoch];
    }

    /// @inheritdoc IRegistrationManager
    function totalSentinelStakedAmountByEpoch(uint16 epoch) external view returns (uint256) {
        return _sentinelsEpochsTotalStakedAmount[epoch];
    }

    /// @inheritdoc IRegistrationManager
    function totalSentinelStakedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[]((endEpoch + 1) - startEpoch);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _sentinelsEpochsTotalStakedAmount[epoch];
        }
        return result;
    }

    /// @inheritdoc IRegistrationManager
    function updateGuardiansRegistrations(
        address[] calldata owners,
        uint16[] calldata numbersOfEpochs,
        address[] calldata guardians
    ) external onlyRole(Roles.UPDATE_GUARDIAN_REGISTRATION_ROLE) {
        for (uint16 i = 0; i < owners.length; ) {
            _updateGuardianRegistration(owners[i], numbersOfEpochs[i], guardians[i]);

            unchecked {
                ++i;
            }
        }
    }

    /// @inheritdoc IRegistrationManager
    function updateGuardianRegistration(
        address owner,
        uint16 numberOfEpochs,
        address guardian
    ) external onlyRole(Roles.UPDATE_GUARDIAN_REGISTRATION_ROLE) {
        _updateGuardianRegistration(owner, numberOfEpochs, guardian);
    }

    function _updateGuardianRegistration(address owner, uint16 numberOfEpochs, address guardian) internal {
        if (numberOfEpochs == 0) {
            revert Errors.InvalidNumberOfEpochs(numberOfEpochs);
        }

        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        Registration storage currentRegistration = _guardianRegistrations[guardian];

        uint16 currentRegistrationEndEpoch = currentRegistration.endEpoch;
        uint16 startEpoch = currentEpoch + 1;
        uint16 endEpoch = startEpoch + numberOfEpochs - 1;

        // NOTE: reset _epochsTotalNumberOfGuardians if the guardian was already registered and if the current epoch is less than the
        // epoch in which the current registration ends.
        if (currentRegistration.owner != address(0) && currentEpoch < currentRegistrationEndEpoch) {
            for (uint16 epoch = startEpoch; epoch <= currentRegistrationEndEpoch; ) {
                unchecked {
                    --_epochsTotalNumberOfGuardians[epoch];
                    ++epoch;
                }
            }
        }

        _guardianRegistrations[guardian] = Registration(owner, startEpoch, endEpoch, Constants.REGISTRATION_GUARDIAN);

        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            unchecked {
                ++_epochsTotalNumberOfGuardians[epoch];
                ++epoch;
            }
        }

        emit GuardianRegistrationUpdated(owner, startEpoch, endEpoch, guardian, Constants.REGISTRATION_GUARDIAN);
    }

    /// @inheritdoc IRegistrationManager
    function updateSentinelRegistrationByBorrowing(
        address owner,
        uint16 numberOfEpochs,
        bytes calldata signature
    ) external onlyForwarder {
        _updateSentinelRegistrationByBorrowing(owner, numberOfEpochs, signature);
    }

    /// @inheritdoc IRegistrationManager
    function updateSentinelRegistrationByBorrowing(uint16 numberOfEpochs, bytes calldata signature) external {
        _updateSentinelRegistrationByBorrowing(_msgSender(), numberOfEpochs, signature);
    }

    /// @inheritdoc IRegistrationManager
    function updateSentinelRegistrationByStaking(
        address owner,
        uint256 amount,
        uint64 duration,
        bytes calldata signature
    ) external {
        address sentinel = getSentinelAddressFromSignature(owner, signature);

        // TODO: What does it happen if an user updateSentinelRegistrationByStaking in behalf of someone else using a wrong signature?

        Registration storage registration = _sentinelRegistrations[sentinel];
        if (registration.kind == Constants.REGISTRATION_SENTINEL_BORROWING) {
            revert Errors.InvalidRegistration();
        }

        if (amount < Constants.STAKING_MIN_AMOUT_FOR_SENTINEL_REGISTRATION) {
            revert Errors.InvalidAmount();
        }

        IERC20Upgradeable(token).safeTransferFrom(_msgSender(), address(this), amount);
        IERC20Upgradeable(token).approve(stakingManager, amount);
        IStakingManagerPermissioned(stakingManager).stake(owner, amount, duration);

        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint16 startEpoch = currentEpoch + 1;
        uint16 endEpoch = currentEpoch + uint16(duration / IEpochsManager(epochsManager).epochDuration()) - 1;
        uint16 registrationStartEpoch = registration.startEpoch;
        uint16 registrationEndEpoch = registration.endEpoch;

        if (_sentinelsEpochsStakedAmount[sentinel].length == 0) {
            _sentinelsEpochsStakedAmount[sentinel] = new uint24[](Constants.AVAILABLE_EPOCHS);
        }

        uint24 truncatedAmount = Helpers.truncate(amount);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            _sentinelsEpochsStakedAmount[sentinel][epoch] += truncatedAmount;
            _sentinelsEpochsTotalStakedAmount[epoch] += truncatedAmount;
            unchecked {
                ++epoch;
            }
        }

        if (startEpoch > registrationEndEpoch) {
            registrationStartEpoch = startEpoch;
        }

        if (endEpoch > registrationEndEpoch) {
            registrationEndEpoch = endEpoch;
        }

        _updateSentinelRegistration(
            sentinel,
            owner,
            amount,
            registrationStartEpoch,
            registrationEndEpoch,
            Constants.REGISTRATION_SENTINEL_STAKING
        );
    }

    function _increaseSentinelRegistrationDuration(address owner, uint64 duration) internal {
        address sentinel = _ownersSentinel[owner];
        Registration storage registration = _sentinelRegistrations[sentinel];
        if (registration.kind == Constants.REGISTRATION_SENTINEL_BORROWING) {
            revert Errors.InvalidRegistration();
        }

        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();

        IStakingManagerPermissioned(stakingManager).increaseDuration(owner, duration);
        IStakingManagerPermissioned.Stake memory stake = IStakingManagerPermissioned(stakingManager).stakeOf(owner);

        uint64 blockTimestamp = uint64(block.timestamp);
        uint16 startEpoch = currentEpoch + 1;
        // if startDate hasn't just been reset(increasing duration where block.timestamp < oldEndDate) it means that we have to count the epoch next to the current endEpoch one
        uint16 numberOfEpochs = uint16((stake.endDate - blockTimestamp) / epochDuration) -
            (stake.startDate == blockTimestamp ? 1 : 0);
        uint16 endEpoch = uint16(startEpoch + numberOfEpochs - 1);
        uint24 truncatedAmount = Helpers.truncate(stake.amount);

        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            if (_sentinelsEpochsStakedAmount[sentinel][epoch] == 0) {
                _sentinelsEpochsStakedAmount[sentinel][epoch] += truncatedAmount;
                _sentinelsEpochsTotalStakedAmount[epoch] += truncatedAmount;
            }

            unchecked {
                ++epoch;
            }
        }

        if (stake.startDate == blockTimestamp) {
            registration.startEpoch = startEpoch;
        }
        registration.endEpoch = endEpoch;

        emit DurationIncreased(sentinel, endEpoch);
    }

    function _updateSentinelRegistrationByBorrowing(
        address owner,
        uint16 numberOfEpochs,
        bytes calldata signature
    ) internal {
        if (numberOfEpochs == 0) {
            revert Errors.InvalidNumberOfEpochs(numberOfEpochs);
        }

        address sentinel = getSentinelAddressFromSignature(owner, signature);

        Registration storage registration = _sentinelRegistrations[sentinel];
        if (registration.kind == Constants.REGISTRATION_SENTINEL_STAKING) {
            revert Errors.InvalidRegistration();
        }

        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint16 currentRegistrationStartEpoch = registration.startEpoch;
        uint16 currentRegistrationEndEpoch = registration.endEpoch;

        uint16 startEpoch = currentEpoch >= currentRegistrationEndEpoch
            ? currentEpoch + 1
            : currentRegistrationEndEpoch + 1;
        uint16 endEpoch = startEpoch + numberOfEpochs - 1;

        for (uint16 epoch = startEpoch; epoch <= endEpoch; ) {
            ILendingManager(lendingManager).borrow(Constants.BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION, epoch, sentinel);
            unchecked {
                ++epoch;
            }
        }

        _updateSentinelRegistration(
            sentinel,
            owner,
            Constants.BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION,
            currentEpoch >= currentRegistrationEndEpoch ? startEpoch : currentRegistrationStartEpoch,
            endEpoch,
            Constants.REGISTRATION_SENTINEL_BORROWING
        );
    }

    function _updateSentinelRegistration(
        address sentinel,
        address owner,
        uint256 amount,
        uint16 startEpoch,
        uint16 endEpoch,
        bytes1 kind
    ) internal {
        _ownersSentinel[owner] = sentinel;
        _sentinelRegistrations[sentinel] = Registration(owner, startEpoch, endEpoch, kind);
        emit SentinelRegistrationUpdated(owner, startEpoch, endEpoch, sentinel, kind, amount);
    }

    function _authorizeUpgrade(address) internal override onlyRole(Roles.UPGRADE_ROLE) {}
}
