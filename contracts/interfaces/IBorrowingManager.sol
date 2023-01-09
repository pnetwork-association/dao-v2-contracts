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
     * @param epoch The epoch
     * @param amount The amount
     */
    event LendedAmountIncreased(uint256 indexed epoch, uint256 amount);

    /**
     * @dev Emitted when a borrower borrows a certain amount of tokens for a number of epochs.
     *
     * @param borrower The borrower address
     * @param startEpoch The start epoch
     * @param endEpoch The end epoch
     * @param amount The amount
     */
    event Borrowed(address indexed borrower, uint256 indexed startEpoch, uint256 indexed endEpoch, uint256 amount);

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
     * @notice Borrow a certain amount of tokens for a certain number of epochs for a borrower. This function shold be called
     * only by who owns the BORROW_ROLE role.
     *
     * @param amount
     * @param numberOfEpochs
     * @param borrower
     * @param minAmount
     * @param maxAmount
     *
     * @return (uint256,uint256) representing the starting and the ending epochs of the current borrowing position.
     */
    function borrow(
        uint256 amount,
        uint256 numberOfEpochs,
        address borrower,
        uint256 minAmount,
        uint256 maxAmount
    ) external returns (uint256, uint256);

    /*
     * @notice Claim the interests earned by the lender for a given epoch.
     *
     * @param asset
     * @param epoch
     *
     */
    function claimInterest(address asset, uint256 epoch) external;

    /*
     * @notice TODO
     *
     * @param amount
     * @param asset
     * @param epoch
     *
     */
    function depositInterest(address asset, uint256 amount, uint256 epoch) external;

    /*
     * @notice Returns the borrowable amount for the given epoch
     *
     * @param epoch
     *
     * @return uint256 an integer representing the borrowable amount for the given epoch.
     */
    function borrowableAmountByEpoch(uint256 epoch) external view returns (uint256);

    /*
     * @notice Returns the borrowed amount for a borrower for given epoch.
     *
     * @param borrower
     * @param epoch
     *
     * @return uint256 an integer representing the borrowed amount for a given borrower and a given epoch
     */
    function borrowedAmountByEpochOf(address borrower, uint256 epoch) external view returns (uint256);

    /*
     * @notice Returns the lender's claimable amount for a given asset in a specifich epoch.
     *
     * @param lender
     * @param asset
     * @param epoch
     *
     * @return uint256 an integer representing the lender's claimable value for a given asset in a specifich epoch..
     */
    function claimableAssetAmountByEpochOf(
        address lender,
        address asset,
        uint256 epoch
    ) external view returns (uint256);

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
        address[] memory assets,
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory);

    /*
     * @notice Returns the lended amount by an user and an epoch.
     *
     * @param lender
     * @param epoch
     *
     * @return uint256 an integer representing the lended amount for a given user and a given epoch.
     */
    function lendedAmountByEpochOf(address lender, uint256 epoch) external view returns (uint256);

    /*
     * @notice Returns the lended amount by an user in the selected epochs
     *
     * @param lender
     * @param startEpoch
     * @param endEpoch
     *
     * @return uint256 an integer representing the lended amount by an user in the selected epochs.
     */
    function lendedAmountByEpochsRangeOf(
        address lender,
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory);

    /*
     * @notice Returns the epoch at which the loan starts given a lender.
     *
     * @param lender
     * @param epoch
     *
     * @return uint256 an integer representing the epoch at which the loan starts.
     */
    function loanStartEpochOf(address lender) external view returns (uint256);

    /*
     * @notice Returns the epoch at which the loan ends given a lender.
     *
     * @param borrower
     * @param epoch
     *
     * @return uint256 an integer representing the epoch at which the loan ends.
     */
    function loanEndEpochOf(address lender) external view returns (uint256);

    /*
     * @notice Returns the borrowed amount for a given epoch.
     *
     * @param epoch
     *
     * @return uint256 an integer representing the borrowed amount for a given epoch
     */
    function totalBorrowedAmountByEpoch(uint256 epoch) external view returns (uint256);

    /*
     * @notice Returns the lended amount for a given epoch.
     *
     * @param epoch
     *
     * @return uint256 an integer representing the lended amount for a given epoch.
     */
    function totalLendedAmountByEpoch(uint256 epoch) external view returns (uint256);

    /*
     * @notice Returns the maximum lended amount for the selected epochs.
     *
     * @param startEpoch
     * @param endEpoch
     *
     * @return uint256 an integer representing the maximum lended amount for a given epoch.
     */
    function totalLendedAmountByEpochsRange(
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory);

    /*
     * @notice Lend in behalf of receiver a certain amount of tokens locked for a given period of time. The lended
     * tokens are forwarded within the StakingManager. This fx is just a proxy fx to the StakingManager.stake that counts
     * how many tokens can be borrowed.
     *
     * @param amount
     * @param lockTime
     * @param receiver
     *
     */
    function lend(uint256 amount, uint64 lockTime, address receiver) external;

    /*
     * @notice Delete the borrower for a given epoch.
     * In order to call it the sender must have the RELEASE_ROLE role.
     *
     * @param borrower
     * @param epoch
     *
     */
    function release(address borrower, uint256 epoch) external;

    /*
     * @notice Returns the current total asset interest amount by epoch
     *
     * @param asset
     * @param epoch
     *
     * @return (uint256,uint256) representing the total asset interest amount by epoch.
     */
    function totalAssetInterestAmountByEpoch(address asset, uint256 epoch) external view returns (uint256);

    /*
     * @notice Returns the utilization rate (percentage of borrowed tokens compared to the lended ones) in the given epoch
     *
     * @param epoch
     *
     * @return uint256 an integer representing the utilization rate in a given epoch.
     */
    function utilizationRatioByEpoch(uint256 epoch) external view returns (uint256);

    /*
     * @notice Returns the utilization rate (percentage of borrowed tokens compared to the lended ones) given the start end the end epoch
     *
     * @param startEpoch
     * @param endEpoch
     *
     * @return uint256 an integer representing the utilization rate in a given the start end the end epoch.
     */
    function utilizationRatioByEpochsRange(
        uint256 startEpoch,
        uint256 endEpoch
    ) external view returns (uint256[] memory);
}
