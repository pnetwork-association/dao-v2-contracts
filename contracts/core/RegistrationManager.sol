// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IStakingManager} from "../interfaces/IStakingManager.sol";
import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {IBorrowingManager} from "../interfaces/IBorrowingManager.sol";
import {IRegistrationManager} from "../interfaces/IRegistrationManager.sol";
import {Roles} from "../libraries/Roles.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries//Constants.sol";
import {Helpers} from "../libraries/Helpers.sol";

contract RegistrationManager is
    IRegistrationManager,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    mapping(address => Registration) private _sentinelRegistrations;
    mapping(address => address) private _ownersSentinel;

    uint24[] private _sentinelsEpochsTotalStakedAmount;
    mapping(address => uint24[]) private _sentinelsEpochsStakedAmount;

    address public stakingManager;
    address public token;
    address public epochsManager;
    address public borrowingManager;

    function initialize(
        address _token,
        address _stakingManager,
        address _epochsManager,
        address _borrowingManager
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        stakingManager = _stakingManager;
        token = _token;
        epochsManager = _epochsManager;
        borrowingManager = _borrowingManager;

        _sentinelsEpochsTotalStakedAmount = new uint24[](36);
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
    function sentinelOf(address owner) external view returns (address) {
        return _ownersSentinel[owner];
    }

    /// @inheritdoc IRegistrationManager
    function updateSentinelRegistrationByBorrowing(uint16 numberOfEpochs, bytes calldata signature) external {
        address owner = _msgSender();
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
            IBorrowingManager(borrowingManager).borrow(
                Constants.BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION,
                epoch,
                sentinel
            );
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

    /// @inheritdoc IRegistrationManager
    function updateSentinelRegistrationByStaking(
        uint256 amount,
        uint64 duration,
        bytes calldata signature,
        address owner
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
        IStakingManager(stakingManager).stake(amount, duration, owner);

        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        uint16 startEpoch = currentEpoch + 1;
        uint16 endEpoch = currentEpoch + uint16(duration / IEpochsManager(epochsManager).epochDuration()) - 1;
        uint16 registrationStartEpoch = registration.startEpoch;
        uint16 registrationEndEpoch = registration.endEpoch;

        if (_sentinelsEpochsStakedAmount[sentinel].length == 0) {
            _sentinelsEpochsStakedAmount[sentinel] = new uint24[](36);
        }

        uint24 truncatedAmount = Helpers.truncate(amount, 0);
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
                IBorrowingManager(borrowingManager).release(
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
    function totalSentinelStakedAmountByEpoch(uint16 epoch) external view returns (uint256) {
        return _sentinelsEpochsTotalStakedAmount[epoch];
    }

    /// @inheritdoc IRegistrationManager
    function totalSentinelStakedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](endEpoch - startEpoch + 1);
        for (uint16 epoch = startEpoch; epoch <= endEpoch; epoch++) {
            result[epoch - startEpoch] = _sentinelsEpochsTotalStakedAmount[epoch];
        }
        return result;
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

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
