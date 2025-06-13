# Enrollment Configuration

## How to Change Starting Enrollment Number

To change the starting enrollment number for new student registrations:

1. Open `config/enrollmentConfig.js`
2. Modify the `STARTING_ENROLLMENT_NUMBER` value
3. Save the file

## How to Change Cohort Information

To update the cohort details that are automatically added to every submission:

1. Open `config/enrollmentConfig.js`
2. Modify the `COHORT_TYPE` and `COHORT_NUMBER` values
3. Save the file

## Examples

### Enrollment Number Configuration
```javascript
// Default - starts from 2001
export const STARTING_ENROLLMENT_NUMBER = 2001;
// Results in: 25MBY2001, 25MBY2002, 25MBY2003...

// Custom starting number - starts from 1000  
export const STARTING_ENROLLMENT_NUMBER = 1000;
// Results in: 25MBY1000, 25MBY1001, 25MBY1002...

// Higher starting number - starts from 5000
export const STARTING_ENROLLMENT_NUMBER = 5000;
// Results in: 25MBY5000, 25MBY5001, 25MBY5002...
```

### Cohort Configuration
```javascript
// Full Stack Development Cohort
export const COHORT_TYPE = "Full Stack Development";
export const COHORT_NUMBER = "1.0";

// Data Science Cohort
export const COHORT_TYPE = "Data Science";
export const COHORT_NUMBER = "2.0";

// AI/ML Cohort
export const COHORT_TYPE = "AI/ML";
export const COHORT_NUMBER = "3.0";

// DevOps Cohort
export const COHORT_TYPE = "DevOps";
export const COHORT_NUMBER = "4.0";
```

## Important Notes

- **Enrollment ID**: Only affects NEW databases. If you already have students enrolled, the system will continue from the last enrollment ID in the database
- **Cohort Info**: Automatically added to EVERY form submission. Students don't need to select these values
- **Format maintained**: All enrollment IDs follow the pattern `YY + MBY + ####` where:
  - `YY` = Current year (last 2 digits)
  - `MBY` = Fixed prefix for MentiBY
  - `####` = 4-digit number starting from your configured value
- **Auto-increment**: Each new submission automatically increments by 1 from the last database entry

## Current Configuration

**Enrollment Settings:**
- Starting Number: **2001**
- Current Year: **25** (2025)
- Next ID Format: **25MBY2001**

**Cohort Settings:**
- Cohort Type: **"Full Stack Development"**
- Cohort Number: **"1.0"**

## Database Structure

The following columns are automatically populated:
- `EnrollmentID`: Auto-generated (e.g., 25MBY2001)
- `Cohort Type`: From config constant
- `Cohort Number`: From config constant
- All other form fields from user input 