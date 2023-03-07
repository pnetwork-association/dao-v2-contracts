// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IBorrowingManager
 * @author pNetwork
 *
 * @notice
 */
interface IBorrowingManager {
    /**
     * @dev Emitted when the lended amount for a certain epoch increase.
     *
     * @param lender The lender
     * @param startEpoch The start epoch
     * @param endEpoch The end epoch
     * @param amount The amount
     */
    event Lended(address indexed lender, uint256 indexed startEpoch, uint256 indexed endEpoch, uint256 amount);

    /**
     * @dev Emitted when a borrower borrows a certain amount of tokens for a number of epochs.
     *
     * @param borrower The borrower address
     * @param epoch The epoch
     * @param amount The amount
     */
    event Borrowed(address indexed borrower, uint256 indexed epoch, uint256 amount);

    /**
     * @dev Emitted when an interest is claimed
     *
     * @param lender The lender address
     * @param asset The claimed asset address
     * @param epoch The epoch
     * @param amount The amount
     */
    event InterestClaimed(address indexed lender, address indexed asset, uint256 indexed epoch, uint256 amount);

    /**
     * @dev Emitted when an interest is lended
     *
     * @param asset The asset
     * @param epoch The current epoch
     * @param amount The amount
     */
    event InterestDeposited(address indexed asset, uint256 indexed epoch, uint256 amount);

    /**
     * @dev Emitted when a borrower borrow is released.
     *
     * @param borrower The borrower address
     * @param epoch The current epoch
     * @param amount The amount
     */
    event Released(address indexed borrower, uint256 indexed epoch, uint256 amount);

    /*
     * @notice Borrow a certain amount of tokens in a given epoch
     *
     * @param amount
     * @param epoch
     * @param borrower
     *
     */
    function borrow(uint256 amount, uint16 epoch, address borrower) external;

    /*
     * @notice Returns the borrowable amount for the given epoch
     *
     * @param epoch
     *
     * @return uint24 an integer representing the borrowable amount for the given epoch.
     */
    function borrowableAmountByEpoch(uint16 epoch) external view returns (uint24);

    /*
     * @notice Returns the borrowed amount of a given user in a given epoch
     *
     * @param borrower
     * @param epoch
     *
     * @return uint24 an integer representing the borrowed amount of a given user in a given epoch.
     */
    function borrowedAmountByEpochOf(address borrower, uint16 epoch) external view returns (uint24);

    /*
     * @notice Returns the lender's claimable amount for a given asset in a specifich epoch.
     *
     * @param lender
     * @param asset
     * @param epoch
     *
     * @return uint256 an integer representing the lender's claimable value for a given asset in a specifich epoch..
     */
    function claimableInterestByEpochOf(address lender, address asset, uint16 epoch) external view returns (uint256);

    /*
     * @notice Returns the lender's claimable amount for a set of assets in an epochs range
     *
     * @param lender
     * @param assets
     * @param startEpoch
     * @param endEpoch
     *
     * @return uint256 an integer representing the lender's claimable amount for a set of assets in an epochs range.
     */
    function claimableAssetsAmountByEpochsRangeOf(
        address lender,
        address[] calldata assets,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory);

    /*
     * @notice Claim the interests earned by the lender for a given epoch for a given asset.
     *
     * @param asset
     * @param epoch
     *
     */
    function claimInterestByEpoch(address asset, uint16 epoch) external;

    /*
     * @notice Claim the interest earned by the lender in an epochs range for a given asset.
     *
     * @param asset
     * @param startEpoch
     * @param endEpoch
     *
     */
    function claimInterestByEpochsRange(address asset, uint16 startEpoch, uint16 endEpoch) external;

    /*
     * @notice Deposit an interest amount of an asset in a given epoch.
     *
     * @param amount
     * @param asset
     * @param epoch
     *
     */
    function depositInterest(address asset, uint16 epoch, uint256 amount) external;

    /*
     * @notice Lend in behalf of lender a certain amount of tokens locked for a given period of time. The lended
     * tokens are forwarded within the StakingManager. This fx is just a proxy fx to the StakingManager.stake that counts
     * how many tokens can be borrowed.
     *
     * @param lender
     * @param amount
     * @param duration
     *
     */
    function lend(address lender, uint256 amount, uint64 duration) external;

    /*
     * @notice Returns the borrowed amount for a given epoch.
     *
     * @param epoch
     *
     * @return uint24 representing an integer representing the borrowed amount for a given epoch.
     */
    function totalBorrowedAmountByEpoch(uint16 epoch) external view returns (uint24);

    /*
     * @notice Returns the borrowed amount in an epochs range.
     *
     * @param startEpoch
     * @param endEpoch
     *
     * @return uint24[] representing an integer representing the borrowed amount in an epochs range.
     */
    function totalBorrowedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint24[] memory);

    /*
     * @notice Returns the lended amount for a given epoch.
     *
     * @param epoch
     *
     * @return uint256 an integer representing the lended amount for a given epoch.
     */
    function totalLendedAmountByEpoch(uint16 epoch) external view returns (uint24);

    /*
     * @notice Returns the maximum lended amount for the selected epochs.
     *
     * @param startEpoch
     * @param endEpoch
     *
     * @return uint24[] representing an array of integers representing the maximum lended amount for a given epoch.
     */
    function totalLendedAmountByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint24[] memory);

    /*
     * @notice Delete the borrower for a given epoch.
     * In order to call it the sender must have the RELEASE_ROLE role.
     *
     * @param borrower
     * @param epoch
     * @param amount
     *
     */
    function release(address borrower, uint16 epoch, uint256 amount) external;

    /*
     * @notice Returns the current total asset interest amount by epoch
     *
     * @param asset
     * @param epoch
     *
     * @return (uint256,uint256) representing the total asset interest amount by epoch.
     */
    function totalAssetInterestAmountByEpoch(address asset, uint16 epoch) external view returns (uint256);

    /*
     * @notice Returns the current total weight for a given epoch. The total weight is the sum of the user weights in a specific epoch.
     *
     * @param asset
     * @param epoch
     *
     * @return uint32 representing the current total weight for a given epoch.
     */
    function totalWeightByEpoch(uint16 epoch) external view returns (uint32);

    /*
     * @notice Returns the current total weight for a given epochs range. The total weight is the sum of the user weights in a specific epochs range.
     *
     * @param asset
     * @param epoch
     *
     * @return uint32 representing the current total weight for a given epochs range.
     */
    function totalWeightByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint32[] memory);

    /*
     * @notice Returns the utilization rate (percentage of borrowed tokens compared to the lended ones) in the given epoch
     *
     * @param epoch
     *
     * @return uint24 an integer representing the utilization rate in a given epoch.
     */
    function utilizationRatioByEpoch(uint16 epoch) external view returns (uint24);

    /*
     * @notice Returns the utilization rate (percentage of borrowed tokens compared to the lended ones) given the start end the end epoch
     *
     * @param startEpoch
     * @param endEpoch
     *
     * @return uint24 an integer representing the utilization rate in a given the start end the end epoch.
     */
    function utilizationRatioByEpochsRange(uint16 startEpoch, uint16 endEpoch) external view returns (uint24[] memory);

    /*
     * @notice Returns the user weight in a given epoch. The user weight is calculated with
     * the following formula: lendedAmount * numberOfEpochsLeft in a given epoch
     *
     * @param lender
     * @param epoch
     *
     * @return uint32 an integer representing the user weight in a given epoch.
     */
    function weightByEpochOf(address lender, uint16 epoch) external view returns (uint32);

    /*
     * @notice Returns the user weights in an epochs range. The user weight is calculated with
     * the following formula: lendedAmount * numberOfEpochsLeft in a given epoch
     *
     * @param lender
     * @param epoch
     *
     * @return uint32[] an integer representing the user weights in an epochs range.
     */
    function weightByEpochsRangeOf(
        address lender,
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint32[] memory);
}
