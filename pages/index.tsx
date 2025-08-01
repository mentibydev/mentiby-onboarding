import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { STARTING_ENROLLMENT_NUMBER, COHORT_TYPE, COHORT_NUMBER } from '../config/enrollmentConfig';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const skillsList = ['Python', 'C', 'C++', 'HTML/CSS', 'JS', 'Java'];
const codingLevels = ['Beginner', 'Intermediate', 'Advanced'];

export default function OnboardingForm() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    linkedin: '',
    github: '',
    hackerrank: '',
    college: '',
    collegeState: '',
    collegeYear: '',
    branch: '',
    graduationYear: '',
    understanding: '',
    familiarSkills: [] as string[],
    builtProjects: '',
    goal: '',
    cohortNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Check for existing submission token on component mount
  useEffect(() => {
    const checkSubmissionStatus = () => {
      if (typeof window !== 'undefined') {
        const submissionToken = localStorage.getItem('mentiby_submission_token');
        if (submissionToken) {
          setHasSubmitted(true);
          setSuccess(true);
          
          // Check if this is a duplicate submission by checking if existing enrollment ID exists
          // but regular enrollment ID doesn't
          const existingEnrollmentId = localStorage.getItem('mentiby_existing_enrollment_id');
          const regularEnrollmentId = localStorage.getItem('mentiby_enrollment_id');
          
          if (existingEnrollmentId && !regularEnrollmentId) {
            setError('duplicate'); // Set duplicate error state for reload case
          }
        }
      }
    };

    checkSubmissionStatus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev) => ({
        ...prev,
        familiarSkills: checked
          ? [...prev.familiarSkills, value]
          : prev.familiarSkills.filter((skill) => skill !== value),
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // First, validate cohort number against config
      if (form.cohortNumber !== COHORT_NUMBER) {
        throw new Error(`Variable mismatch detected. Something went wrong from MentiBY's side. Please contact MentiBY with a screenshot and your cohort type and cohort number.`);
      }

      // Check if email already exists with same cohort type and cohort number
      const { data: existingUser, error: emailCheckError } = await supabase
        .from('onboarding')
        .select('Email')
        .eq('Email', form.email)
        .eq('"Cohort Type"', COHORT_TYPE)
        .eq('"Cohort Number"', COHORT_NUMBER)
        .limit(1);

      if (emailCheckError) {
        console.error('Error checking email:', emailCheckError);
        throw new Error('Unable to verify email. Please try again.');
      }

      if (existingUser && existingUser.length > 0) {
        // Email already exists with same cohort type and number - fetch enrollment ID and show already registered message
        const { data: userDetails, error: detailsError } = await supabase
          .from('onboarding')
          .select('EnrollmentID')
          .eq('Email', form.email)
          .eq('"Cohort Type"', COHORT_TYPE)
          .eq('"Cohort Number"', COHORT_NUMBER)
          .limit(1);

        let enrollmentId = null;
        if (!detailsError && userDetails && userDetails.length > 0) {
          enrollmentId = userDetails[0].EnrollmentID;
        }

        const submissionToken = `mentiby_duplicate_${form.email}_${Date.now()}`;
        if (typeof window !== 'undefined') {
          localStorage.setItem('mentiby_submission_token', submissionToken);
          if (enrollmentId) {
            localStorage.setItem('mentiby_existing_enrollment_id', enrollmentId);
          }
        }
        setSuccess(true);
        setHasSubmitted(true);
        setError('duplicate'); // Special error state for duplicate email
        return; // Exit early
      }

      // Validate graduation year
      if (form.graduationYear && parseInt(form.graduationYear) < 2025) {
        throw new Error('Graduation year must be 2025 or later');
      }
      // Generate unique EnrollmentID by checking the last entry in database
      const year = new Date().getFullYear().toString().slice(-2);

      // Fetch the last enrollment ID from the database for this specific cohort
      // Try different approaches to get the last enrollment ID for the specific COHORT_TYPE + COHORT_NUMBER
      let lastEntry = null;
      let fetchError = null;

      // First try: Order by EnrollmentID for specific cohort combination
      try {
        const result = await supabase
          .from('onboarding')
          .select('"EnrollmentID"')
          .eq('"Cohort Type"', COHORT_TYPE)        // Filter by cohort type
          .eq('"Cohort Number"', COHORT_NUMBER)    // Filter by cohort number
          .order('"EnrollmentID"', { ascending: false })
          .limit(1);
        lastEntry = result.data;
        fetchError = result.error;
        console.log(`Querying for cohort: ${COHORT_TYPE} - ${COHORT_NUMBER}`);
      } catch (err) {
        console.log('First approach failed, trying alternative...');

        // Second try: Get all records for this cohort and find the latest one manually
        try {
          const result = await supabase
            .from('onboarding')
            .select('"EnrollmentID"')
            .eq('"Cohort Type"', COHORT_TYPE)
            .eq('"Cohort Number"', COHORT_NUMBER);

          if (result.data && result.data.length > 0) {
            // Sort enrollment IDs manually to find the highest number for this cohort
            const sortedEntries = result.data.sort((a, b) => {
              const aNum = parseInt(a.EnrollmentID.match(/(\d+)$/)?.[1] || '0');
              const bNum = parseInt(b.EnrollmentID.match(/(\d+)$/)?.[1] || '0');
              return bNum - aNum; // Descending order
            });
            lastEntry = [sortedEntries[0]];
          }
          fetchError = result.error;
        } catch (err2) {
          console.error('Both approaches failed:', err2);
          fetchError = err2;
        }
      }

      if (fetchError) {
        console.error(`Error fetching last enrollment ID for cohort ${COHORT_TYPE}-${COHORT_NUMBER}:`, fetchError);
        // Continue with default starting number if query fails
      }

      let nextRollNumber = STARTING_ENROLLMENT_NUMBER.toString().padStart(4, '0'); // Use the starting enrollment number

      if (lastEntry && lastEntry.length > 0) {
        const lastEnrollmentID = lastEntry[0]['EnrollmentID'];
        console.log(`Last enrollment ID found for cohort ${COHORT_TYPE}-${COHORT_NUMBER}:`, lastEnrollmentID);

        // Extract the roll number from the last enrollment ID (format: 25MBY2001)
        const rollNumberMatch = lastEnrollmentID.match(/(\d+)$/);
        if (rollNumberMatch) {
          const lastRollNumber = parseInt(rollNumberMatch[1]);
          nextRollNumber = (lastRollNumber + 1).toString().padStart(4, '0');
          console.log(`Incremented from ${lastRollNumber} to ${nextRollNumber} for cohort ${COHORT_TYPE}-${COHORT_NUMBER}`);
        }
      } else {
        console.log(`No existing entries found for cohort ${COHORT_TYPE}-${COHORT_NUMBER}, using starting number:`, nextRollNumber);
      }

      // Generate enrollment ID with additional uniqueness check
      let enrollmentID = `${year}MBY${nextRollNumber}`;
      console.log(`Generated enrollment ID for cohort ${COHORT_TYPE}-${COHORT_NUMBER}:`, enrollmentID);

      // Double-check if this ID already exists to avoid duplicates
      const { data: existingEntry } = await supabase
        .from('onboarding')
        .select('"EnrollmentID", "Cohort Type", "Cohort Number"')
        .eq('"EnrollmentID"', enrollmentID)
        .limit(1);

      if (existingEntry && existingEntry.length > 0) {
        console.log(`Enrollment ID ${enrollmentID} already exists...`);
        
        // Check if the existing entry is from a different cohort
        const existingCohortType = existingEntry[0]['Cohort Type'];
        const existingCohortNumber = existingEntry[0]['Cohort Number'];
        
        if (existingCohortType !== COHORT_TYPE || existingCohortNumber !== COHORT_NUMBER) {
          // The ID exists in a different cohort, which means this cohort has ended
          console.log(`ID ${enrollmentID} belongs to ${existingCohortType}-${existingCohortNumber}, not ${COHORT_TYPE}-${COHORT_NUMBER}`);
          throw new Error('COHORT_CLOSED');
        }
        
        // If it's the same cohort, increment and try again (shouldn't happen with our logic, but safety check)
        const currentNumber = parseInt(nextRollNumber);
        nextRollNumber = (currentNumber + 1).toString().padStart(4, '0');
        enrollmentID = `${year}MBY${nextRollNumber}`;
        console.log(`New enrollment ID for cohort ${COHORT_TYPE}-${COHORT_NUMBER}:`, enrollmentID);
      }

      // Prepare data for Supabase (try with original column names first)
      const submissionData = {
        'EnrollmentID': enrollmentID,
        'Full Name': form.fullName,
        'Email': form.email,
        'Phone Number': form.phoneNumber,
        'LinkedIn': form.linkedin || null,
        'GitHub': form.github || null,
        'Hackerrank': form.hackerrank || null,
        'College': form.college,
        'College State': form.collegeState,
        'College Year': form.collegeYear,
        'Branch': form.branch,
        'Graduation Year': form.graduationYear,
        'Understanding': form.understanding,
        'Familiar Skills': form.familiarSkills.join(', '),
        'Built Projects': form.builtProjects,
        'Goal': form.goal,
        'Cohort Type': COHORT_TYPE,
        'Cohort Number': COHORT_NUMBER,
      };

      console.log('Submitting data:', submissionData); // Debug log

      // Insert into Supabase with better error handling
      const { data, error } = await supabase
        .from('onboarding')
        .insert([submissionData])
        .select();

      if (error) {
        console.error('Supabase error:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      console.log('Success! Inserted data:', data); // Debug log

      // Create unique submission token and save to localStorage
      const submissionToken = `mentiby_${enrollmentID}_${Date.now()}`;
      if (typeof window !== 'undefined') {
        localStorage.setItem('mentiby_submission_token', submissionToken);
        localStorage.setItem('mentiby_enrollment_id', enrollmentID);
        localStorage.setItem('mentiby_submission_date', new Date().toISOString());
      }

      setSuccess(true);
      setHasSubmitted(true);

      // Clear form data for security
      setForm({
        fullName: '',
        email: '',
        phoneNumber: '',
        linkedin: '',
        github: '',
        hackerrank: '',
        college: '',
        collegeState: '',
        collegeYear: '',
        branch: '',
        graduationYear: '',
        understanding: '',
        familiarSkills: [],
        builtProjects: '',
        goal: '',
        cohortNumber: '',
      });
    } catch (err: any) {
      console.error('Submission error:', err);
      
      // Handle specific error cases
      if (err.message === 'COHORT_CLOSED') {
        setError('cohort_closed');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // If user has already submitted, show success state directly
  if (hasSubmitted || success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-12 px-4 relative overflow-hidden">
        {/* Enhanced Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-pulse animation-delay-2000"></div>
          <div className="absolute top-40 left-1/2 w-80 h-80 bg-gradient-to-r from-pink-500 to-orange-500 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-pulse animation-delay-4000"></div>
        </div>

        {/* Floating Particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => {
            // Use deterministic values instead of Math.random() to avoid hydration mismatch
            const left = ((i * 37 + 13) % 100);
            const top = ((i * 43 + 17) % 100);
            const delay = (i * 0.7) % 5;
            const duration = 3 + (i % 4);

            return (
              <div
                key={i}
                className="absolute w-2 h-2 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full opacity-60 animate-float"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  animationDelay: `${delay}s`,
                  animationDuration: `${duration}s`,
                }}
              ></div>
            );
          })}
        </div>

        {/* Success Page - Full Screen */}
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center max-w-4xl mx-auto px-8">
            {error === 'cohort_closed' ? (
              // Cohort Closed Message
              <>
                {/* Closed Animation */}
                <div className="mb-12 animate-fadeIn">
                  <div className="relative inline-block">
                    <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center animate-pulse">
                      <span className="text-6xl">🚫</span>
                    </div>
                    {/* Warning effects around closed symbol */}
                    <div className="absolute inset-0">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-3 h-3 bg-gradient-to-r from-red-400 to-red-500 rounded-full animate-ping"
                          style={{
                            left: `${25 + (i * 12)}%`,
                            top: `${25 + ((i % 2) * 50)}%`,
                            animationDelay: `${i * 0.4}s`,
                          }}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cohort Closed Message */}
                <div className="space-y-8 animate-fadeIn">
                  <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-red-300 via-red-400 to-red-500 bg-clip-text text-transparent animate-gradient drop-shadow-2xl">
                    Cohort Onboarding Closed
                  </h1>

                  <div className="h-4 bg-gradient-to-r from-red-400 via-red-500 to-red-600 rounded-full animate-pulse shadow-lg max-w-2xl mx-auto"></div>

                  <p className="text-2xl md:text-3xl text-red-100 font-light tracking-wide leading-relaxed">
                    🚫 Your cohort's Onboarding Closed. Please Contact MentiBY
                  </p>

                  <div className="mt-12 p-8 rounded-3xl bg-gradient-to-r from-red-600/20 to-red-700/20 border-2 border-red-500/30 backdrop-blur-sm">
                    <p className="text-xl text-red-200 font-semibold mb-4">
                      🔒 Enrollment Period Ended
                    </p>
                    <p className="text-lg text-gray-300 leading-relaxed">
                      The enrollment period for your cohort has ended and new registrations are no longer accepted. 
                      Please contact MentiBY support for assistance.
                    </p>
                  </div>

                  {/* Contact information */}
                  <div className="mt-16 space-y-6">
                    <div className="flex justify-center space-x-8 text-5xl">
                      <span className="animate-bounce" style={{ animationDelay: '0s' }}>📞</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>📧</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>💬</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.6s' }}>🚫</span>
                    </div>

                    <p className="text-lg text-red-200">
                      Contact MentiBY support team for more information about upcoming cohorts.
                    </p>
                  </div>
                </div>
              </>
            ) : error === 'duplicate' ? (
              // Already Registered Message
              <>
                {/* Warning Animation */}
                <div className="mb-12 animate-fadeIn">
                  <div className="relative inline-block">
                    <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-r from-orange-400 to-red-400 rounded-full flex items-center justify-center animate-pulse">
                      <span className="text-6xl">⚠️</span>
                    </div>
                    {/* Glowing effects around warning */}
                    <div className="absolute inset-0">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-3 h-3 bg-gradient-to-r from-red-400 to-orange-400 rounded-full animate-ping"
                          style={{
                            left: `${25 + (i * 12)}%`,
                            top: `${25 + ((i % 2) * 50)}%`,
                            animationDelay: `${i * 0.4}s`,
                          }}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Already Registered Message */}
                <div className="space-y-8 animate-fadeIn">
                  <h1 className="text-5xl md:text-7xl font-black bg-gradient-to-r from-orange-300 via-red-300 to-pink-300 bg-clip-text text-transparent animate-gradient drop-shadow-2xl">
                    You are already registered
                  </h1>

                  <div className="h-4 bg-gradient-to-r from-orange-400 via-red-400 to-pink-400 rounded-full animate-pulse shadow-lg max-w-2xl mx-auto"></div>

                  <p className="text-2xl md:text-3xl text-gray-100 font-light tracking-wide leading-relaxed">
                    ⚠️ Multiple form submission may lead to revoke course access
                  </p>

                  <div className="mt-12 p-8 rounded-3xl bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-red-400/30 backdrop-blur-sm">
                    <p className="text-xl text-red-200 font-semibold mb-4">
                      🚫 Important Notice
                    </p>
                    <p className="text-lg text-gray-300 leading-relaxed">
                      Your email address is already associated with an existing registration. 
                      Attempting to register multiple times may result in the revocation of your course access.
                    </p>
                  </div>

                  {/* Show existing enrollment info if available */}
                  {typeof window !== 'undefined' && localStorage.getItem('mentiby_existing_enrollment_id') && (
                    <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-400/30 backdrop-blur-sm">
                      <p className="text-orange-200 font-semibold mb-2">
                        Your Existing Enrollment ID:
                      </p>
                      <p className="text-2xl font-bold text-yellow-300">
                        {localStorage.getItem('mentiby_existing_enrollment_id')}
                      </p>
                    </div>
                  )}

                  {/* Warning elements */}
                  <div className="mt-16 space-y-6">
                    <div className="flex justify-center space-x-8 text-5xl">
                      <span className="animate-bounce" style={{ animationDelay: '0s' }}>🔒</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>⚠️</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>🚫</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.6s' }}>⚠️</span>
                    </div>

                    <p className="text-lg text-orange-200">
                      If you believe this is an error, please contact our support team.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              // Normal Success Message
              <>
                {/* Success Animation */}
                <div className="mb-12 animate-fadeIn">
                  <div className="relative inline-block">
                    <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-r from-emerald-400 to-green-400 rounded-full flex items-center justify-center animate-bounce">
                      <span className="text-6xl">🎉</span>
                    </div>
                    {/* Sparkle effects around checkmark */}
                    <div className="absolute inset-0">
                      {[...Array(8)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-2 h-2 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full animate-ping"
                          style={{
                            left: `${20 + (i * 15)}%`,
                            top: `${20 + ((i % 2) * 60)}%`,
                            animationDelay: `${i * 0.3}s`,
                          }}
                        ></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Welcome Message */}
                <div className="space-y-8 animate-fadeIn">
                  <h1 className="text-6xl md:text-8xl font-black bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent animate-gradient drop-shadow-2xl">
                    Welcome to MentiBY!
                  </h1>

                  <div className="h-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 rounded-full animate-pulse shadow-lg max-w-2xl mx-auto"></div>

                  <p className="text-3xl md:text-4xl text-gray-100 font-light tracking-wide leading-relaxed">
                    🚀 Your journey begins now!
                  </p>

                  <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
                    Get ready for an amazing adventure in learning and growth. We're excited to have you on board!
                  </p>

                  {/* Additional celebration elements */}
                  <div className="mt-16 space-y-6">
                    <div className="flex justify-center space-x-8 text-6xl">
                      <span className="animate-bounce" style={{ animationDelay: '0s' }}>🎯</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>✨</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>🚀</span>
                      <span className="animate-bounce" style={{ animationDelay: '0.6s' }}>💫</span>
                    </div>

                    <p className="text-lg text-purple-200">
                      Check your email for next steps and welcome information!
                    </p>

                    {/* Show enrollment info if available */}
                    {typeof window !== 'undefined' && localStorage.getItem('mentiby_enrollment_id') && (
                      <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 backdrop-blur-sm">
                        <p className="text-purple-200 font-semibold">
                          Your Enrollment ID: <span className="text-cyan-300">{localStorage.getItem('mentiby_enrollment_id')}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <style jsx>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); }
            33% { transform: translateY(-15px) rotate(120deg) scale(1.1); }
            66% { transform: translateY(-8px) rotate(240deg) scale(0.9); }
          }
          
          @keyframes gradient {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .animate-float {
            animation: float 6s ease-in-out infinite;
          }
          
          .animate-gradient {
            background-size: 200% 200%;
            animation: gradient 3s ease infinite;
          }
          
          .animate-fadeIn {
            animation: fadeIn 0.5s ease-out;
          }
          
          .animation-delay-2000 {
            animation-delay: 2s;
          }
          
          .animation-delay-4000 {
            animation-delay: 4s;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-12 px-4 relative overflow-hidden">
      {/* Enhanced Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-pulse animation-delay-2000"></div>
        <div className="absolute top-40 left-1/2 w-80 h-80 bg-gradient-to-r from-pink-500 to-orange-500 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-pulse animation-delay-4000"></div>
      </div>

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => {
          // Use deterministic values instead of Math.random() to avoid hydration mismatch
          const left = ((i * 37 + 13) % 100);
          const top = ((i * 43 + 17) % 100);
          const delay = (i * 0.7) % 5;
          const duration = 3 + (i % 4);

          return (
            <div
              key={i}
              className="absolute w-2 h-2 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full opacity-60 animate-float"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            ></div>
          );
        })}
      </div>

      {/* Success Page - Full Screen */}
      {success ? (
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center max-w-4xl mx-auto px-8">
            {/* Success Animation */}
            <div className="mb-12 animate-fadeIn">
              <div className="relative inline-block">
                <div className="w-32 h-32 mx-auto mb-8 bg-gradient-to-r from-emerald-400 to-green-400 rounded-full flex items-center justify-center animate-bounce">
                  <span className="text-6xl">🎉</span>
                </div>
                {/* Sparkle effects around checkmark */}
                <div className="absolute inset-0">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-2 h-2 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full animate-ping"
                      style={{
                        left: `${20 + (i * 15)}%`,
                        top: `${20 + ((i % 2) * 60)}%`,
                        animationDelay: `${i * 0.3}s`,
                      }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>

            {/* Welcome Message */}
            <div className="space-y-8 animate-fadeIn">
              <h1 className="text-6xl md:text-8xl font-black bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent animate-gradient drop-shadow-2xl">
                Welcome to MentiBY!
              </h1>

              <div className="h-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 rounded-full animate-pulse shadow-lg max-w-2xl mx-auto"></div>

              <p className="text-3xl md:text-4xl text-gray-100 font-light tracking-wide leading-relaxed">
                🚀 Your journey begins now!
              </p>

              <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
                Get ready for an amazing adventure in learning and growth. We're excited to have you on board!
              </p>

              {/* Additional celebration elements */}
              <div className="mt-16 space-y-6">
                <div className="flex justify-center space-x-8 text-6xl">
                  <span className="animate-bounce" style={{ animationDelay: '0s' }}>🎯</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>✨</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>🚀</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.6s' }}>💫</span>
                </div>

                <p className="text-lg text-purple-200">
                  Check your email for next steps and welcome information!
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Enhanced Header */}
          <div className="text-center mb-16">
            <div className="inline-block">
              <h1 className="text-6xl md:text-8xl font-black bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mb-6 animate-gradient drop-shadow-2xl">
                MentiBY
              </h1>
              <div className="h-3 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 rounded-full animate-pulse shadow-lg"></div>
            </div>
            <p className="text-gray-200 text-2xl mt-10 font-light tracking-wide">Join the Future of Learning ✨</p>
          </div>

          {/* Glassmorphism Form Container */}
          <div className="backdrop-blur-3xl bg-gradient-to-br from-white/15 to-white/5 rounded-3xl border border-white/20 shadow-2xl p-8 md:p-12 relative overflow-hidden">
            {/* Decorative border glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-cyan-400/30 via-purple-400/30 to-pink-400/30 blur-lg animate-pulse"></div>

            <div className="relative z-10">
              <form className="space-y-12" onSubmit={handleSubmit}>
                {/* Personal Information Section */}
                <div className="space-y-8">
                  <div className="flex items-center mb-10">
                    <div className="w-4 h-12 bg-gradient-to-b from-cyan-400 to-purple-600 rounded-full mr-6 shadow-lg animate-pulse"></div>
                    <h2 className="text-4xl font-bold text-transparent bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text">
                      Personal Information
                    </h2>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Full Name */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block"><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-100 via-white to-purple-100 font-black tracking-wide">Full Name</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          required
                          name="fullName"
                          value={form.fullName}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="Enter your full name"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* Email */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block"><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-100 via-white to-purple-100 font-black tracking-wide">Email Address</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          required
                          name="email"
                          type="email"
                          value={form.email}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="Enter your email address used for registration"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div className="form-group group md:col-span-2">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block"><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-100 via-white to-purple-100 font-black tracking-wide">Phone Number</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          required
                          name="phoneNumber"
                          type="tel"
                          value={form.phoneNumber}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="Enter your phone number"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gradient Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"></div>

                {/* Social Profiles Section */}
                <div className="space-y-8">
                  <div className="flex items-center mb-10">
                    <div className="w-4 h-12 bg-gradient-to-b from-purple-400 to-pink-600 rounded-full mr-6 shadow-lg animate-pulse"></div>
                    <h2 className="text-4xl font-bold text-transparent bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text">
                      Social Profiles
                    </h2>
                  </div>

                  <div className="grid md:grid-cols-3 gap-8">
                    {/* LinkedIn */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">LinkedIn Profile</span></label>
                      <div className="relative">
                        <input
                          name="linkedin"
                          value={form.linkedin}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="LinkedIn URL"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* GitHub */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">GitHub Profile</span></label>
                      <div className="relative">
                        <input
                          name="github"
                          value={form.github}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="GitHub URL"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* Hackerrank */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">Hackerrank</span></label>
                      <div className="relative">
                        <input
                          name="hackerrank"
                          value={form.hackerrank}
                          onChange={handleChange}
                          className="w-full px-5 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="Hackerrank Profile Link"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Academic Information Section */}
                <div className="space-y-8">
                  <div className="flex items-center mb-10">
                    <div className="w-4 h-12 bg-gradient-to-b from-pink-400 to-orange-600 rounded-full mr-6 shadow-lg animate-pulse"></div>
                    <h2 className="text-4xl font-bold text-transparent bg-gradient-to-r from-pink-300 to-orange-300 bg-clip-text">
                      Academic Information
                    </h2>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8">
                    {/* College Name */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">College Name</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          name="college"
                          value={form.college}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="College Name"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* College State */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">College State</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          name="collegeState"
                          value={form.collegeState}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="College State"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* College Year */}
                    <div className="form-group group md:col-span-2">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">Current Year of Study</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          name="collegeYear"
                          value={form.collegeYear}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="e.g. 2nd Year"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* Branch */}
                    <div className="form-group group md:col-span-2">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">Branch</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          name="branch"
                          value={form.branch}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="Branch"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                    </div>

                    {/* Graduation Year */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">Graduation Year</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          name="graduationYear"
                          type="number"
                          min="2025"
                          max="2035"
                          value={form.graduationYear}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder="e.g. 2025"
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                      {/* Validation message for graduation year */}
                      {form.graduationYear && parseInt(form.graduationYear) < 2025 && (
                        <p className="mt-2 text-red-400 text-sm font-semibold">
                          ⚠️ Graduation year must be 2025 or later
                        </p>
                      )}
                    </div>

                    {/* Cohort Number */}
                    <div className="form-group group">
                      <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">MentiBY Cohort Number</span> <span className="text-pink-400 font-black">*</span></label>
                      <div className="relative">
                        <input
                          required
                          name="cohortNumber"
                          value={form.cohortNumber}
                          onChange={handleChange}
                          className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                          placeholder={`Enter cohort number (e.g. ${COHORT_NUMBER})`}
                        />
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                      </div>
                      <p className="mt-2 text-gray-300 text-sm">
                        ℹ️ Please enter your cohort number for verification
                      </p>
                    </div>
                  </div>
                </div>

                {/* Gradient Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-pink-400/50 to-transparent"></div>

                {/* Skills & Experience Section */}
                <div className="space-y-8">
                  <div className="flex items-center mb-10">
                    <div className="w-4 h-12 bg-gradient-to-b from-orange-400 to-red-600 rounded-full mr-6 shadow-lg animate-pulse"></div>
                    <h2 className="text-4xl font-bold text-transparent bg-gradient-to-r from-orange-300 to-red-300 bg-clip-text">
                      Skills & Experience
                    </h2>
                  </div>

                  {/* Understanding Level */}
                  <div className="form-group group">
                    <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">Coding Experience Level</span> <span className="text-pink-400 font-black">*</span></label>
                    <div className="relative">
                      <select
                        name="understanding"
                        value={form.understanding}
                        onChange={handleChange}
                        className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                      >
                        <option value="">Select your level</option>
                        {codingLevels.map((level) => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                    </div>
                  </div>

                  {/* Enhanced Skill Checkboxes */}
                  <div className="form-group group">
                    <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">Familiar Technologies</span> <span className="text-pink-400 font-black">*</span></label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-8">
                      {skillsList.map((skill, index) => {
                        const gradients = [
                          'from-blue-500 to-purple-600',
                          'from-green-500 to-teal-600',
                          'from-yellow-500 to-orange-600',
                          'from-pink-500 to-red-600',
                          'from-purple-500 to-indigo-600',
                          'from-cyan-500 to-blue-600'
                        ];
                        const skillIcons = {
                          'Python': '🐍',
                          'C': '⚡',
                          'C++': '💻',
                          'HTML/CSS': '🎨',
                          'JS': '🚀',
                          'Java': '☕'
                        };
                        const isSelected = form.familiarSkills.includes(skill);

                        return (
                          <label
                            key={skill}
                            className={`group relative cursor-pointer transition-all duration-300 transform hover:scale-105 ${isSelected ? 'scale-105' : ''
                              }`}
                          >
                            <input
                              type="checkbox"
                              name="familiarSkills"
                              value={skill}
                              checked={isSelected}
                              onChange={handleChange}
                              className="sr-only"
                            />
                            <div className={`
                              relative p-6 rounded-2xl backdrop-blur-sm border-2 transition-all duration-300
                              ${isSelected
                                ? `bg-gradient-to-br ${gradients[index % gradients.length]} border-white/40 shadow-lg shadow-purple-500/25`
                                : 'bg-white/10 border-white/20 hover:border-white/40 hover:bg-white/15'
                              }
                            `}>
                              {/* Skill Icon */}
                              <div className="text-3xl mb-3 text-center">
                                {skillIcons[skill as keyof typeof skillIcons]}
                              </div>

                              {/* Skill Name */}
                              <div className={`text-center font-semibold transition-colors duration-300 ${isSelected ? 'text-white' : 'text-gray-200'
                                }`}>
                                {skill}
                              </div>

                              {/* Checkmark */}
                              <div className={`
                                absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 
                                flex items-center justify-center text-white text-sm font-bold transition-all duration-300
                                ${isSelected ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
                              `}>
                                ✓
                              </div>

                              {/* Hover glow effect */}
                              <div className={`
                                absolute inset-0 rounded-2xl bg-gradient-to-br ${gradients[index % gradients.length]} 
                                opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur-sm
                              `}></div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Built Projects */}
                  <div className="form-group group">
                    <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">Have you built any projects?</span> <span className="text-pink-400 font-black">*</span></label>
                    <div className="relative">
                      <select
                        name="builtProjects"
                        value={form.builtProjects}
                        onChange={handleChange}
                        className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                      >
                        <option value="">Select an option</option>
                        <option value="YES">Yes, I have</option>
                        <option value="NO">No, not yet</option>
                      </select>
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                    </div>
                  </div>
                </div>

                {/* Gradient Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-orange-400/50 to-transparent"></div>

                {/* Goals Section */}
                <div className="space-y-8">
                  <div className="flex items-center mb-10">
                    <div className="w-4 h-12 bg-gradient-to-b from-red-400 to-pink-600 rounded-full mr-6 shadow-lg animate-pulse"></div>
                    <h2 className="text-4xl font-bold text-transparent bg-gradient-to-r from-red-300 to-pink-300 bg-clip-text">
                      Your Goals
                    </h2>
                  </div>

                  <div className="form-group group">
                    <label className="form-label font-black text-xl md:text-2xl mb-4 block drop-shadow-lg"><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-purple-200 font-black">What's your long-term goal with MentiBY?</span> <span className="text-pink-400 font-black">*</span></label>
                    <div className="relative">
                      <textarea
                        name="goal"
                        value={form.goal}
                        onChange={handleChange}
                        className="w-full px-6 py-4 rounded-2xl bg-gradient-to-r from-white/90 to-gray-50/90 border-2 border-transparent text-black placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:shadow-lg focus:shadow-purple-400/25 transition-all duration-300 hover:shadow-md backdrop-blur-sm"
                        placeholder="Tell us about your aspirations and what you hope to achieve..."
                        rows={4}
                      />
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-400/0 via-purple-400/20 to-pink-400/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="text-center pt-10">
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative px-12 py-6 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white font-bold text-xl rounded-3xl shadow-2xl transition-all duration-500 transform hover:scale-105 hover:shadow-purple-500/25 hover:shadow-2xl disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden"
                  >
                    {/* Button glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"></div>

                    {/* Button content */}
                    <div className="relative z-10 flex items-center justify-center space-x-3">
                      {loading ? (
                        <>
                          <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Launching your journey...</span>
                        </>
                      ) : (
                        <>
                          <span className="group-hover:animate-bounce">🚀</span>
                          <span>Start Your Adventure</span>
                          <span className="group-hover:animate-pulse">✨</span>
                        </>
                      )}
                    </div>

                    {/* Animated sparkles */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="absolute w-1 h-1 bg-white rounded-full animate-ping"
                          style={{
                            left: `${20 + i * 15}%`,
                            top: `${20 + (i % 2) * 60}%`,
                            animationDelay: `${i * 0.2}s`,
                          }}
                        ></div>
                      ))}
                    </div>
                  </button>
                </div>

                {/* Enhanced Status Messages */}
                {error && error !== 'duplicate' && error !== 'cohort_closed' && (
                  <div className="mt-10 p-6 rounded-3xl bg-gradient-to-r from-red-500/20 to-pink-500/20 border border-red-400/30 backdrop-blur-sm animate-fadeIn">
                    <div className="flex items-center justify-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-red-400 to-pink-400 rounded-full flex items-center justify-center">
                        <span className="text-white text-lg">⚠</span>
                      </div>
                      <p className="text-red-300 font-semibold text-lg text-center">
                        {error}
                      </p>
                    </div>
                  </div>
                )}

                {error === 'cohort_closed' && (
                  <div className="mt-10 p-6 rounded-3xl bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 backdrop-blur-sm animate-fadeIn">
                    <div className="flex items-center justify-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-lg">🚫</span>
                      </div>
                      <p className="text-red-300 font-semibold text-lg text-center">
                        Your cohort's Onboarding Closed. Please Contact MentiBY
                      </p>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); }
          33% { transform: translateY(-15px) rotate(120deg) scale(1.1); }
          66% { transform: translateY(-8px) rotate(240deg) scale(0.9); }
        }
        
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        @keyframes glow {
          0%, 100% { opacity: 0.5; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        
        .form-group {
          @apply relative;
        }
        
        .form-label {
          @apply block text-gray-100 font-bold mb-4 text-lg tracking-wide;
        }
        
        .text-shadow {
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.3);
        }
        
        .input-wrapper, .select-wrapper, .textarea-wrapper {
          @apply relative;
        }
        
        .input-glow, .select-glow, .textarea-glow {
          @apply absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-400/0 via-purple-400/20 to-pink-400/0 opacity-0 transition-opacity duration-300 pointer-events-none;
        }
        
        .input-wrapper:hover .input-glow,
        .select-wrapper:hover .select-glow,
        .textarea-wrapper:hover .textarea-glow {
          @apply opacity-100;
          animation: glow 2s ease-in-out infinite;
        }
        
        .skill-checkbox {
          @apply cursor-pointer relative;
        }
        
        .skill-card {
          @apply relative flex items-center p-5 rounded-xl bg-gradient-to-r from-slate-800/60 to-slate-700/60 border-2 border-purple-400/20 transition-all duration-300 hover:border-purple-400/50 hover:scale-105 backdrop-blur-sm;
        }
        
        .skill-checkbox input:checked + .skill-card {
          @apply bg-gradient-to-r from-purple-600/40 to-pink-600/40 border-purple-400 shadow-lg shadow-purple-400/20;
        }
        
        .skill-icon {
          @apply relative mr-4;
        }
        
        .skill-check {
          @apply w-8 h-8 rounded-full border-2 border-gray-400 flex items-center justify-center transition-all duration-300;
        }
        
        .skill-checkbox input:checked + .skill-card .skill-check {
          @apply bg-gradient-to-r from-purple-500 to-pink-500 border-transparent;
        }
        
        .skill-checkbox input:not(:checked) + .skill-card .skill-check svg {
          @apply opacity-0;
        }
        
        .skill-text {
          @apply text-gray-100 font-semibold text-lg;
        }
        
        .skill-glow {
          @apply absolute inset-0 rounded-xl bg-gradient-to-r from-purple-400/0 via-purple-400/30 to-pink-400/0 opacity-0 transition-opacity duration-300 pointer-events-none;
        }
        
        .skill-checkbox:hover .skill-glow {
          @apply opacity-100;
          animation: glow 1.5s ease-in-out infinite;
        }
        
        .submit-button {
          @apply relative w-full py-6 rounded-2xl overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transform transition-all duration-300 hover:scale-105 active:scale-95;
        }
        
        .submit-button-bg {
          @apply absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 transition-all duration-300;
        }
        
        .submit-button:hover .submit-button-bg {
          @apply bg-gradient-to-r from-purple-500 via-pink-500 to-red-500;
          animation: glow 1s ease-in-out infinite;
        }
        
        .submit-button-content {
          @apply relative z-10 text-white font-bold text-xl;
        }
        
        .success-message {
          @apply mt-8 p-8 rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-2 border-green-400/40 backdrop-blur-sm;
        }
        
        .error-message {
          @apply mt-8 p-8 rounded-2xl bg-gradient-to-r from-red-500/20 to-pink-500/20 border-2 border-red-400/40 backdrop-blur-sm;
        }
        
        .border-3 {
          border-width: 3px;
        }
      `}</style>
    </div>
  );
}
