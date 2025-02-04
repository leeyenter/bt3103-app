import data
import numpy as np
import pandas as pd

def getModuleGrades(module_code = None, program_subset=None):
    '''
    Filter grades by module_code and/or a list of tokens

    Parameters
    ----------
    module_code: string, optional
        module code
    program_subset: Pandas DataFrame, optional
        Subset of program enrolment dataframe

    Returns
    -------
    dict
        A dictionary of keys ``counts`` and ``students``. Depending on input arguments, dictionary consists of grades with this module code and/ or grades belonging to students in the program subset.
    '''
    if module_code is not None:
        module_subset = data.module_all_terms(module_code)
    else:
        module_subset = data.module_enrolment

    # Filter to a specific subset of tokens, if specified
    if program_subset is not None:
        module_subset = module_subset.join(
            program_subset[['token']].set_index("token"), on='token', how='inner')

    subset_grades = module_subset.final_grade.value_counts()
    counts = []
    students = []
    for grade in data.grades.keys():
        counts.append(int(subset_grades.get(grade, 0)))
        students.append(list(module_subset[module_subset.final_grade == grade]['token']))
    return {"counts": counts, "students": students}


def get_faculty_tag_counts(module_code):
    '''
    Fetch list of tags and tags count for the module.

    Parameters
    ----------
    module_code: string
        module code

    Returns
    -------
    list
        List of objects with ``tag name`` as key and number of clicks (``count``) as value. List is sorted alphabetically by tag name.
    '''
    results = []
    for tag, value in data.tags.items():
        if 'modules' in value and module_code in value['modules']:
            results.append({'tag': tag, 'count': value['count']})
    return sorted(results, key = lambda x: x['count'], reverse = True)


def demographics(module_code):
    '''
    Fetch all demographic data to be displayed for a given module code.

    Parameters
    ----------
    module_code: string
        module code

    Returns
    -------
    dict
        A dictionary of keys ``degrees``, ``academic_career``, ``faculty``, ``academic_load`` and ``years``.
    '''
    results = {}

    program_current = data.program_current_term(module_code)

    # Fetch program information about current students
    results["degrees"] = data.countsAsLists(program_current, 'academic_plan_descr')
    results["academic_career"] = data.countsAsDict(program_current, 'academic_career')
    results["faculty"] = data.countsAsDict(program_current, 'faculty_descr')
    results["academic_load"] = data.countsAsDict(program_current, 'academic_load_descr')

    # Count of years of current students
    results["years"] = [0, 0, 0, 0]
    years = (18.1 - (program_current.admit_term / 100)).astype(int).value_counts().to_dict()
    for year, count in years.items():
        results["years"][min(year-1, 3)] += count

    return results

def getPrereqGrades(token, prereqs):
    '''
    For each student, check which prerequisites have been taken, and how the student fared.
    Used in ``enrolment`` function.

    Parameters
    ----------
    token: string
        student token number

    Returns
    -------
    string
        Concatenation of current module's prerequisites' module code and respective letter grade student has received.
    '''
    output = ""

    modules_taken = data.module_enrolment[(data.module_enrolment.token == token) & (data.module_enrolment.module_code.isin(prereqs))]
    for i in range(modules_taken.shape[0]):
        code = modules_taken.iloc[i]['module_code']
        grade = modules_taken.iloc[i]['original_letter_grade']
        if str(grade) == 'nan':
            grade = "-"
        text = str(code) + " (" + grade + ")"

        if len(output) == 0:
            output = text
        else:
            output += ", " + text

    if len(output) == 0:
        output = "-"

    return output

def enrolment(module_code):
    '''
    Fetch all student enrolment data to be displayed for a given module code.

    Parameters
    ----------
    module_code: string
        module code

    Returns
    -------
    dict
        A dictionary of keys ``attendance``, ``webcast``, ``CAP``, and ``prereqs``.
    '''
    program_current = data.program_current_term(module_code).fillna(0)

    program_current['attendance'] = program_current['attendance'].apply(
        lambda x: format(x, '.2f'))
    program_current['webcast'] = program_current['webcast'].apply(
        lambda x: format(x, '.2f'))
    program_current['CAP'] = program_current['CAP'].apply(
        lambda x: format(x, '.2f'))

    # For each student token, check which of the prereqs they have done
    # and their grades for it
    prereqs = data.fetchPrereqs(module_code)

    program_current['prereqs'] = program_current.token.apply(getPrereqGrades, args=(prereqs,))
    program_current.drop_duplicates(inplace=True)
    return program_current.to_dict('records')

def calculate_influence_scores(module_past, module_code):
    '''
    Statistical analysis part 1.
    Perform statistical analysis on students based on their results of the modules they have taken.
    Specifically, the accummulated difference of their final marks and the modules' average final marks.
    Used in ``academics`` function.
    '''
    module_influence_scores = {}
    for i in range(module_past.shape[0]):
        student = module_past.iloc[i]
        marks = student['final_marks'] - module_past['final_marks'].mean()
        if marks == 0:
            continue
        # For each student, we go through what modules they've taken, and assign the module their score
        modules_taken = data.module_enrolment[data.module_enrolment['token']
                                         == student['token']]
        for j in range(modules_taken.shape[0]):
            module = modules_taken.iloc[j]['module_code']
            if module == module_code:
                continue
            if module not in module_influence_scores:
                module_influence_scores[module] = []
            module_influence_scores[module].append(marks)

    for key, value in module_influence_scores.items():
        module_influence_scores[key] = np.mean(value)
    return module_influence_scores

def identify_potential_students(module_current, module_influence_scores, all_bool, fac_set=None):
    '''
    Statistical analysis part 2.
    Identify students who are doing above and below average for module. Student are grouped by their home faculties.
    Used in ``academics`` function.
    '''
    good_student_scores = []
    bad_student_scores = []

    for l in range(module_current.shape[0]):
        student = module_current.iloc[l]
        if all_bool or (fac_set is not None and student['token'] in list(fac_set['token'])):
            scores = []
            influencing_modules = []
            # Iterate through all modules this student has taken
            # If they are in the list, add to his 'score'
            modules_taken = data.module_enrolment[data.module_enrolment['token']
                                            == student['token']]
            for j in range(modules_taken.shape[0]):
                module = modules_taken.iloc[j]['module_code']
                if module in module_influence_scores:
                    scores.append(module_influence_scores[module])
                    influencing_modules.append({'code': module, 'score': format(module_influence_scores[module], ".2f")})
            if len(scores) == 0:
                score = 0
            else:
                score = np.mean(scores)
            if score > 0:
                good_student_scores.append([student['token'], score, influencing_modules])
            elif score < 0:
                bad_student_scores.append([student['token'], score, influencing_modules])
    return (good_student_scores, bad_student_scores)

def calculate_grade_distribution(set, results, key):
    '''
    Calculate the grade distribution of current students.
    Used in ``academics`` function.
    '''
    for j in range(set.shape[0]):
        grade = set.iloc[j]['CAP']
        token = set.iloc[j]['token']
        grade_index = 5
        if grade >= 4.5:
            grade_index = 0
        elif grade >= 4:
            grade_index = 1
        elif grade >= 3.5:
            grade_index = 2
        elif grade >= 3:
            grade_index = 3
        elif grade >= 2:
            grade_index = 4

        results[key]["curr_grades"][grade_index] += 1
        results[key]["curr_grades_students"][grade_index].append(str(token))

def modules_per_student(fac_set, results, key):
    '''
    Count number of modules that each student is taking this semester.
    Used in ``academics`` function.
    '''
    students = fac_set[['token']]
    module_counts = students.join(data.module_enrolment[data.module_enrolment.term == max(data.module_enrolment.term)].set_index('token'), on='token', how='inner').groupby('token').size()
    module_counts = pd.DataFrame(module_counts).reset_index()
    results[key]['semester_workload'] = data.countsAsDict(module_counts, 0)

def academics(module_code):
    '''
    Fetch all academic data to be displayed for a given module code.
    Includes option/ dictionary to filter information by faculties.

    Parameters
    ----------
    module_code: string
        module code
    '''
    program_current = data.program_current_term(module_code)
    program_past = data.program_past_terms(module_code)[['token', 'faculty_descr','attendance', 'CAP', 'webcast']].dropna()
    module_current = data.module_current_term(module_code)
    module_past = data.module_past_terms(module_code)
    faculties = program_current['faculty_descr'].unique()

    results = {}
    #create the same data as module Academics but added a new key of unique faculties
    # and the value will be the same data but filtered by faculties
    #also added an All key after the faculties keys so that we can display everything also

    # Some statistical analysis part 1 for module_influence_scores
    module_influence_scores = calculate_influence_scores(module_past, module_code)

    # A for loop for separation of faculties will all the other variables(curr grades etc)
    for i in range(len(faculties)):
        results[faculties[i]] = {}
        results[faculties[i]]["curr_grades"] = [0,0,0,0,0,0]
        results[faculties[i]]["curr_grades_students"] = [[], [], [], [], [], []]
        fac_set = program_current[program_current['faculty_descr'] == faculties[i]]
         # Fetch a count of past grades
        results[faculties[i]]['grades'] = getModuleGrades(program_subset=fac_set)

        calculate_grade_distribution(fac_set, results, faculties[i])

        modules_per_student(fac_set, results, faculties[i])

        results[faculties[i]]['attendance_cap'] = []
        results[faculties[i]]['attendance_cap_students'] = []
        results[faculties[i]]['webcast_cap'] = []
        results[faculties[i]]['webcast_cap_students'] = []
        fac_set_past = program_past[program_past['faculty_descr'] == faculties[i]]

        for k in range(fac_set.shape[0]):
            student = fac_set.iloc[k]
            results[faculties[i]]['attendance_cap'].append({
                'x': float(student['attendance']),
                'y': float(student['CAP'])
            })
            results[faculties[i]]['attendance_cap_students'].append(student['token'])
            results[faculties[i]]['webcast_cap'].append({
                'x': float(student['webcast']),
                'y': float(student['CAP'])
            })
            results[faculties[i]]['webcast_cap_students'].append(student['token'])

        # Fetch grades for prereqs
        prereqs = data.fetchPrereqs(module_code)
        results[faculties[i]]['prereqs'] = []
        for prereq in prereqs:
            prereq_data = {
                'module_code': prereq,
                'grades': getModuleGrades(prereq, fac_set[['token']])
            }

            # Only append if we have found students who took this prereq
            if sum(prereq_data['grades']['counts']) > 0:
                results[faculties[i]]['prereqs'].append(prereq_data)


        good_student_scores, bad_student_scores = identify_potential_students(module_current, module_influence_scores, False, fac_set)
        results[faculties[i]]['pred_scores_good'] = sorted(good_student_scores, key = lambda x: -x[1])
        results[faculties[i]]['pred_scores_bad'] = sorted(bad_student_scores, key = lambda x: x[1])


    # last key will be all (display everything)
    results["all"] = {}
    results["all"]["curr_grades"] = [0,0,0,0,0,0]
    results["all"]["curr_grades_students"] = [[], [], [], [], [], []]

    calculate_grade_distribution(program_current, results, 'all')

    # Fetch a count of past grades
    results["all"]['grades'] = getModuleGrades(program_subset=program_current)

    # Count number of modules that each student is doing this semester
    students = program_current[['token']]
    module_counts = students.join(data.module_enrolment[data.module_enrolment.term == max(data.module_enrolment.term)].set_index('token'), on='token', how='inner').groupby('token').size()
    module_counts = pd.DataFrame(module_counts).reset_index()
    results["all"]['semester_workload'] = data.countsAsDict(module_counts, 0)

    results["all"]['attendance_cap'] = []
    results["all"]['attendance_cap_students'] = []
    results["all"]['webcast_cap'] = []
    results["all"]['webcast_cap_students'] = []

    for i in range(program_current.shape[0]):
        student = program_current.iloc[i]
        results["all"]['attendance_cap'].append({
            'x': float(student['attendance']),
            'y': float(student['CAP'])
        })
        results["all"]['attendance_cap_students'].append(student["token"])
        results["all"]['webcast_cap'].append({
            'x': float(student['webcast']),
            'y': float(student['CAP'])
        })
        results["all"]['webcast_cap_students'].append(student["token"])

    # Fetch grades for prereqs
    prereqs = data.fetchPrereqs(module_code)
    results['all']['prereqs'] = []
    for prereq in prereqs:
        prereq_data = {
            'module_code': prereq,
            'grades': getModuleGrades(prereq, program_current[['token']])
        }

        # Only append if we have found students who took this prereq
        if sum(prereq_data['grades']['counts']) > 0:
            results['all']['prereqs'].append(prereq_data)

    # Some statistical analysis
    # Now for all prospective students, we look at what modules they have taken and calculate a score
    good_student_scores, bad_student_scores = identify_potential_students(module_current, module_influence_scores, True)
    results['all']['pred_scores_good'] = sorted(good_student_scores, key = lambda x: -x[1])
    results['all']['pred_scores_bad'] = sorted(bad_student_scores, key = lambda x: x[1])

    results['tags'] = get_faculty_tag_counts(module_code)

    return results


def student_info(token):
    '''
    Fetch all information about a student.

    Parameters
    ----------
    token: string
        student token number

    Returns
    -------
    dict
        A dictionary with keys ``information``, ``curr_modules``, and ``past_modules``. Values of each key is a Pandas series/ dataframe.
    '''
    subset = data.program_enrolment[data.program_enrolment['token'] == token]
    subset = subset[subset['term'] == max(subset['term'])]
    subset = subset.iloc[0].copy()
    subset['CAP'] = "{:.2f}".format(subset['CAP'])
    subset['attendance'] = subset['attendance'].astype(str)
    subset['webcast'] = subset['webcast'].astype(str)
    subset['attendance'] = subset['attendance'] + '%'
    subset['webcast'] = subset['webcast'] + '%'

    results = []
    for var_name in subset.index:
        if var_name not in data.column_descriptions.index:
            # Remove those columns we don't want
            continue
        if pd.isnull(subset.loc[var_name]):
            continue
        column = data.column_descriptions.loc[var_name]
        result = {
            'name': column['full_name'],
            'description': column['description'],
            'value': str(subset.loc[var_name])
        }
        results.append(result)

    subset_modules = data.module_enrolment[data.module_enrolment['token'] == token].copy()
    subset_modules.drop(['token', 'academic_career'], axis=1, inplace=True)
    subset_modules.fillna('-', inplace=True)
    subset_modules.sort_values('term', ascending=False, inplace=True)
    curr_modules = subset_modules[subset_modules['term'] == max(subset_modules['term'])][['module_code', 'course_title']].drop_duplicates().to_dict('records')
    past_modules = subset_modules[subset_modules['term'] != max(subset_modules['term'])].to_dict('records')

    for mod in curr_modules:
        nusmods_name = ''
        if mod['module_code'] in data.module_descriptions.index:
            nusmods_name = data.module_descriptions.loc[mod['module_code']]['title']
        mod['nusmods_name'] = nusmods_name

    for mod in past_modules:
        nusmods_name = ''
        if mod['module_code'] in data.module_descriptions.index:
            nusmods_name = data.module_descriptions.loc[mod['module_code']]['title']
        mod['nusmods_name'] = nusmods_name

    return {
        'information': results,
        'curr_modules': curr_modules,
        'past_modules': past_modules
    }
