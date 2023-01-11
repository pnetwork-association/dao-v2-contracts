// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {IBorrowingManager} from "../interfaces/IBorrowingManager.sol";
import {IRegistrationManager} from "../interfaces/IRegistrationManager.sol";
import {IStakingManager} from "../interfaces/external/IStakingManager.sol";
import {Roles} from "../libraries/Roles.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries//Constants.sol";

contract RegistrationManager is
    IRegistrationManager,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => Registration) private _sentinelRegistrations;
    mapping(address => address) private _sentinelOwners;

    mapping(uint256 => mapping(address => uint256)) private _sentinelsEpochsStakingAmount;

    address public stakingManager;
    address public token;
    address public epochsManager;
    address public borrowingManager;

    function initialize(
        address stakingManager_,
        address token_,
        address epochsManager_,
        address borrowingManager_
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        stakingManager = stakingManager_;
        token = token_;
        epochsManager = epochsManager_;
        borrowingManager = borrowingManager_;
    }

    /// @inheritdoc IRegistrationManager
    function getSentinelAddressFromSignature(address owner, bytes calldata signature) public pure returns (address) {
        bytes32 message = ECDSA.toEthSignedMessageHash(keccak256(abi.encodePacked(owner)));
        return ECDSA.recover(message, signature);
    }

    /// @inheritdoc IRegistrationManager
    function sentinelRegistration(address sentinel) external view returns (Registration memory) {
        return _sentinelRegistrations[sentinel];
    }

    /// @inheritdoc IRegistrationManager
    function sentinelReservedAmountByEpochOf(uint256 epoch, address sentinel) external view returns (uint256) {
        Registration storage registration = _sentinelRegistrations[sentinel];
        return
            registration.kind == Constants.REGISTRATION_SENTINEL_STAKING
                ? _sentinelsEpochsStakingAmount[epoch][sentinel]
                : IBorrowingManager(borrowingManager).borrowedAmountByEpochOf(registration.owner, epoch);
    }

    /// @inheritdoc IRegistrationManager
    function sentinelOf(address owner) external view returns (address) {
        return _sentinelOwners[owner];
    }

    /// @inheritdoc IRegistrationManager
    function updateSentinelRegistrationByBorrowing(
        uint256 amount,
        uint256 numberOfEpochs,
        bytes calldata signature
    ) external {
        address owner = _msgSender();
        address sentinel = address(2); //getSentinelAddressFromSignature(owner, signature);

        Registration storage registration = _sentinelRegistrations[sentinel];
        if (registration.kind == Constants.REGISTRATION_SENTINEL_STAKING) revert Errors.InvalidRegistration();

        (uint256 startEpoch, uint256 endEpoch) = IBorrowingManager(borrowingManager).borrow(
            amount,
            numberOfEpochs,
            owner,
            0, //Constants.MINIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION,
            Constants.MAXMIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION
        );

        uint256 registrationEndEpoch = registration.endEpoch;
        if (endEpoch < registrationEndEpoch) revert Errors.InvalidNumberOfEpochs();

        // NOTE: in case of renew startEpoch should not change
        if (startEpoch <= registrationEndEpoch) {
            startEpoch = registration.startEpoch;
        }

        _updateSentinel(sentinel, owner, startEpoch, endEpoch, Constants.REGISTRATION_SENTINEL_BORROWING);
    }

    /// @inheritdoc IRegistrationManager
    function updateSentinelRegistrationByStaking(uint256 amount, uint64 lockTime, bytes calldata signature) external {
        //if (amount < Constants.MINIMUM_AMOUNT_FOR_SENTINEL_REGISTRATION) revert Errors.InsufficentAmount();

        address owner = _msgSender();
        address sentinel = address(1); //getSentinelAddressFromSignature(owner, signature);

        Registration storage registration = _sentinelRegistrations[sentinel];
        if (registration.kind == Constants.REGISTRATION_SENTINEL_BORROWING) revert Errors.InvalidRegistration();

        IERC20Upgradeable(token).safeTransferFrom(owner, address(this), amount);
        IERC20Upgradeable(token).approve(stakingManager, amount);
        IStakingManager(stakingManager).stake(amount, lockTime, owner);

        uint256 epochDuration = IEpochsManager(epochsManager).epochDuration();
        uint256 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        uint256 startEpoch = currentEpoch + 1;
        uint256 numberOfEpochs = lockTime / epochDuration;
        uint256 endEpoch = currentEpoch + numberOfEpochs - 1;
        uint256 registrationStartEpoch = registration.startEpoch;
        uint256 registrationEndEpoch = registration.endEpoch;

        for (uint256 epoch = startEpoch; epoch <= endEpoch; ) {
            _sentinelsEpochsStakingAmount[epoch][sentinel] += amount;
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

        _updateSentinel(
            sentinel,
            owner,
            registrationStartEpoch,
            registrationEndEpoch,
            Constants.REGISTRATION_SENTINEL_STAKING
        );
    }

    /// @inheritdoc IRegistrationManager
    function releaseSentinel(address sentinel) external onlyRole(Roles.RELEASE_SENTINEL) {
        uint256 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        Registration storage registration = _sentinelRegistrations[sentinel];
        address sentinelOwner = registration.owner;

        uint256 registrationEndEpoch = registration.endEpoch;
        uint256 registrationStartEpoch = registration.startEpoch;
        if (registrationEndEpoch < currentEpoch) revert Errors.SentinelNotReleasable(sentinel);

        for (uint256 epoch = currentEpoch; epoch <= registrationEndEpoch; ) {
            delete _sentinelsEpochsStakingAmount[epoch][sentinel];
            if (registration.kind == Constants.REGISTRATION_SENTINEL_BORROWING) {
                IBorrowingManager(borrowingManager).release(sentinelOwner, epoch);
            }
            unchecked {
                ++epoch;
            }
        }

        if (registrationStartEpoch == currentEpoch) {
            delete _sentinelRegistrations[sentinel];
            delete _sentinelOwners[sentinelOwner];
        } else {
            registration.endEpoch = currentEpoch - 1;
        }

        emit SentinelReleased(sentinel, currentEpoch);
    }

    function _updateSentinel(
        address sentinel,
        address owner,
        uint256 startEpoch,
        uint256 endEpoch,
        uint32 kind
    ) internal {
        _sentinelOwners[owner] = sentinel;
        _sentinelRegistrations[sentinel] = Registration(owner, startEpoch, endEpoch, kind);
        emit SentinelRegistrationUpdated(owner, startEpoch, endEpoch, sentinel, kind);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
