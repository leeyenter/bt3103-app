async function getModuleInfo(module_code) {
    return fetch('/bt3103-app/backend/module_description/' + module_code)
        .then((resp) => {
            return resp.json()
        })
}

const Module = {
    props: ["show_extra_data", 'student_enrolment', 'module_prereqs'],
    data() {
        return {
            module_name: ''
        }
    },
    created() {
        this.updateModuleInfo();
    },
    watch: {
        $route(to, from) {
            this.updateModuleInfo();
        }
    },
    methods: {
        updateModuleInfo: function() {
            const vue = this;
            getModuleInfo(this.$route.params.module)
                .then((resp)=>{
                    vue.module_name = resp.title;
                })
        }
    },
    template: `
    <div class='module-page'>
        <div class='container'>
            <h1>{{$route.params.module}}</h1>
            <p v-if='show_extra_data && module_name != ""' class='lead' style='display: flex; align-items: flex-start;'>{{module_name}} &nbsp; <span class='badge badge-success' style='font-size: 8px; font-weight:400;'>third-party data</span></p>
            <ul class=" module-nav nav nav-pills nav-fill">
                <li class='nav-item'>
                    <router-link class='nav-link' to='demographics'>Demographics</router-link>
                </li>
                <li class='nav-item'>
                    <router-link class='nav-link' to='academics'>Academics</router-link>
                </li>
                <li class='nav-item'>
                    <router-link class='nav-link' to='enrolment'>Student Enrolment</router-link>
                </li>
            </ul>
        </div>
        <transition name='fade'>
            <router-view class='child-view' :show_extra_data='show_extra_data' :module_prereqs='module_prereqs' :student_enrolment='student_enrolment'></router-view>
        </transition>
    </div>`
};

function donutChart(id, labels = []) {
    return new Chart(document.getElementById(id), {
        type: "pie",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "No. of students",
                    data: [],
                    backgroundColor: [
                        "rgba(54, 162, 235, 0.6)",
                        "rgba(255, 99, 132, 0.6)",
                        "rgba(75, 192, 192, 0.6)",
                        "rgba(255, 206, 86, 0.6)"
                    ]
                }
            ]
        },
        options: {
            cutoutPercentage: 50,
            rotation: 0.5 * Math.PI,
            animation: {
                animateScale: true
            }
        }
    });
}

const ModuleDemographics = {
    data() {
        return {
            grades: [],
            degrees: [],
            yearsChart: null,
            facultiesChart: null,
            academicLoadChart: null
        };
    },
    mounted() {
        this.fetchData();

        this.yearsChart = donutChart("yearsChart", [
            "Year 1",
            "Year 2",
            "Year 3",
            "Year 4"
        ]);
        this.facultiesChart = barChart(
            "facultiesChart",
            "rgba(100, 155, 255, 0.6)"
        );
        this.academicCareerChart = donutChart("academicCareerChart");
        this.academicLoadChart = donutChart("academicLoadChart");
    },
    methods: {
        updateChart(chart, data) {
            chart.data.labels = data.labels;
            chart.data.datasets[0].data = data.counts;
            chart.data.datasets[0].tooltips = data.students;
            chart.update();
        },
        fetchData() {
            var vue = this;
            fetch("/bt3103-app/backend/faculty/demographics/" + this.$route.params.module)
                .then(function(response) {
                    return response.json();
                })
                .then(function(json) {
                    vue.grades = json.grades;
                    vue.degrees = json.degrees;

                    // Update years
                    vue.yearsChart.data.datasets[0].data = json.years;
                    vue.yearsChart.update();

                    // Update faculties
                    vue.updateChart(vue.facultiesChart, json.faculty);

                    // Update academic careers
                    vue.updateChart(
                        vue.academicCareerChart,
                        json.academic_career
                    );

                    // Update academic careers
                    vue.updateChart(vue.academicLoadChart, json.academic_load);
                });
        }
    },
    watch: {
        $route(to, from) {
            this.fetchData();
        }
    },
    template: `<div class='container-fluid'>
    <div class='chart-rows'>
        <div class='demographic-chart card'>
            <h2>Years of incoming students</h2>
            <p>Your current students are made up of:</p>
            <canvas id="yearsChart" width="100" height="70"></canvas>
        </div>
        <div class='demographic-chart card'>
            <h2>Academic careers of incoming students</h2>
            <p>Your current students are:</p>
            <canvas id="academicCareerChart" width="100" height="70"></canvas>
        </div>
        <div class='demographic-chart card'>
            <h2>Academic load of incoming students</h2>
            <p>Your current students are:</p>
            <canvas id="academicLoadChart" width="100" height="70"></canvas>
        </div>
        <div class='demographic-chart card'>
            <h2>Faculties of incoming students</h2>
            <p>Your current students belong to the following faculties:</p>
            <canvas id="facultiesChart" width="100" height="70"></canvas>
        </div>
        <div class='demographic-chart card'>
            <h2>Majors of incoming students</h2>
            <p>Your current students are currently pursuing:</p>
            <table class='table table-sm table-hover'>
                <thead class='thead-light'>
                    <tr>
                        <th>Degree Name</th>
                        <th>No.</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for='degree in degrees'>
                        <td>{{degree[0]}}</td>
                        <td>{{degree[1]}}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
    </div>`
};

const ModuleAcademics = {
    props: ["show_extra_data"],
    data() {
        return {
            data: null,
            selected: [],
            attendanceCapChart: null,
            webcastCapChart: null,
            pastGradesChart: null,
            semesterWorkloadChart: null,
            currGradesChart: null,
            predicted_scores_good: [],
            predicted_scores_bad: [],
            prereqs: [],
            prereqsTags:{},
            prereqCharts: {},
            display: false // whether we should display the charts
        };
    },
    mounted() {

        this.buildCharts();

    },
    methods: {
        updatePrereqsTags: async function (prereqList) {
            const vue = this;
            for (var i = 0; i < vue.prereqs.length; i++) {
                await getModuleInfo(this.prereqs[i].module_code).then((resp) => {
                    vue.prereqsTags[vue.prereqs[i].module_code] = resp;
                })
            }
            for (var i = 0; i < vue.prereqs.length; i++){
                someToolTipText = "";
                tags = vue.prereqsTags[vue.prereqs[i].module_code]["tags"];
                for (let i = 0; i < tags.length; i++) {
                    someToolTipText += '<span class="badge badge-info" style="font-weight:100;">' + tags[i] + '</span> &nbsp;'
                }
                tippy("#" + vue.prereqs[i].module_code + "-header", {
                    content: someToolTipText,
                    delay: 100,
                    arrow: true,
                    arrowType: 'round',
                    size: 'large',
                    duration: 500,
                    animation: 'scale'
                    });
                };
        },

        buildCharts: function() {
            this.display = false;

            this.currGradesChart = barChart(
                "currGradesChart",
                "rgba(100, 155, 255, 0.6)",
                ["4.50 & above", "4.00 - 4.49", "3.50 - 3.99", "3.00 - 3.49", "2.00 - 2.99", "Below 2.00"]
            );

            this.pastGradesChart = barChart(
                "pastGradesChart",
                "rgba(100, 155, 255, 0.6)",
                ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D+", "D", "F"]
            );

            this.semesterWorkloadChart = barChart(
                "semesterWorkloadChart",
                "rgba(100, 155, 255, 0.6)"
            )

            this.attendanceCapChart = scatterChart(
                "attendanceCapChart",
                "rgba(54, 162, 235, 0.6)",
                "Attendance Rate",
                "CAP"
            );
            this.webcastCapChart = scatterChart(
                "webcastCapChart",
                "rgba(255, 99, 132, 0.6)",
                "Webcast Watch Rate",
                "CAP"
            );
            this.fetchData();
    },
        fetchData: function() {
            var vue = this;
            fetch("/bt3103-app/backend/faculty/academics/" + this.$route.params.module)
                .then(function(response) {

                    return response.json();

                })
                .then(function(json) {
                    console.log(JSON.stringify(json))
                    // Update current grades
                    vue.currGradesChart.data.datasets[0].data = json.curr_grades;
                    vue.currGradesChart.data.datasets[0].tooltips = json.curr_grades_students;
                    vue.currGradesChart.update();

                    // Update past grades
                    vue.pastGradesChart.data.datasets[0].data = json.grades.counts;
                    vue.pastGradesChart.data.datasets[0].tooltips = json.grades.students;
                    vue.pastGradesChart.update();

                    // Semester workload
                    vue.semesterWorkloadChart.data.datasets[0].data = json.semester_workload.counts;
                    vue.semesterWorkloadChart.data.datasets[0].tooltips = json.semester_workload.students;
                    vue.semesterWorkloadChart.data.labels = json.semester_workload.labels;
                    vue.semesterWorkloadChart.update();

                    // Show predicted problem students
                    vue.predicted_scores_good = json.pred_scores_good;
                    vue.predicted_scores_bad = json.pred_scores_bad;

                    vue.attendanceCapChart.data.datasets[0].data =
                        json.attendance_cap;
                    vue.attendanceCapChart.update();
                    vue.webcastCapChart.data.datasets[0].data =
                        json.webcast_cap;
                    vue.webcastCapChart.update();

                    // Show prereq grades
                    vue.prereqs = json.prereqs;

                    console.log(JSON.stringify(vue.prereqs));
                    // Update prereqsTags list

                    vue.updatePrereqsTags(vue.prereqs);

                    // We set a timeout so that the DOM
                    // has time to update
                    setTimeout(function() {
                        for (var i = 0; i < json.prereqs.length; i++) {
                            vue.prereqCharts[i] = barChart(
                                "prereqGradesChart" +
                                    json.prereqs[i].module_code,
                                "rgba(75, 192, 192, 0.6)",
                                [
                                    "A+",
                                    "A",
                                    "A-",
                                    "B+",
                                    "B",
                                    "B-",
                                    "C+",
                                    "C",
                                    "D+",
                                    "D",
                                    "F"
                                ]
                            );
                            vue.prereqCharts[i].data.datasets[0].data =
                                json.prereqs[i].grades.counts;
                            vue.prereqCharts[i].data.datasets[0].tooltips =
                                json.prereqs[i].grades.students;
                            vue.prereqCharts[i].update();
                        }

                    }, 200);

                    vue.display = true;
                });
            }

        },



    template: `<div class='container-fluid'>
        <div v-if='!display' style='text-align: center; margin-top: 48px; opacity: 0.5'>
            <i class='fas fa-spinner fa-pulse fa-lg'></i>
        </div>
        <div v-bind:class='["chart-rows", display ? "" : "hide"]'>
            <div class='demographic-chart card'>
                <h2>CAP of incoming students</h2>
                <p>Your current students have the following grades:</p>
                <canvas id="currGradesChart" width="100" height="70"></canvas>
            </div>
            <div class='demographic-chart card'>
                <h2>Past grades of incoming students</h2>
                <p>Your current students got the following grades in their previous modules:</p>
                <canvas id="pastGradesChart" width="100" height="70"></canvas>
            </div>
            <div class='demographic-chart card'>
                <h2>Semester Workload</h2>
                <p>Your current students are currently taking this number of modules this semester:</p>
                <canvas id="semesterWorkloadChart" width="100" height="70"></canvas>
            </div>
            <div :class='["demographic-chart", "card", show_extra_data ? "":"hide"]'>
                <h2>Attendance vs CAP</h2>
                <div>
                    <span class='badge badge-warning'>Uses mocked up data</span>
                </div>
                <p>Your current students are:</p>
                <canvas id="attendanceCapChart" width="100" height="70"></canvas>
            </div>
            <div :class='["demographic-chart", "card", show_extra_data ? "":"hide"]'>
                <h2>Webcast vs CAP</h2>
                <div>
                    <span class='badge badge-warning'>Uses mocked up data</span>
                </div>
                <p>Your current students are:</p>
                <canvas id="webcastCapChart" width="100" height="70"></canvas>
            </div>
            <div :class='["demographic-chart", "card", show_extra_data ? "":"hide"]' v-for='prereq in prereqs'>
                <h2>Grades for {{prereq.module_code}}</h2>

                <div>
                    <span class='badge badge-success'>Uses third-party data</span>
                </div>
                <canvas :id='"prereqGradesChart"+prereq.module_code' width='100' height='70'></canvas>
                <button :id='prereq.module_code + "-header"' class='btn btn-outline-info' style='margin-top: 12px;'> Hover for more information on {{prereq.module_code}}</button>
            </div>
            <div class='wide-chart card'>
                <h2>Predicted Students To Lookout For</h2>
                <p>A statistical model was run to predict which students may fare better or worse than the average.
                This is based on historical data, by comparing past students' grades and which modules they have
                taken, to what incoming students have also taken before. </p>
                <div class='row'>
                    <div class='col-6'>
                        <p class='lead'>May be ahead of the class:</p>
                        <table class='table table-sm table-hover'>
                            <thead>
                                <tr>
                                    <th>Student Token</th>
                                    <th>Score</th>
                                    <th>Influencing Modules</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for='student in predicted_scores_good'>
                                    <td>{{student[0]}}</td>
                                    <td style='text-align:right;'>{{student[1].toFixed(2)}}</td>
                                    <td>
                                        <span class='badge badge-light' v-for='module in student[2]' style='margin-right: 3px;'>{{module.code}}</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class='col-6'>
                        <p class='lead'>May need some time to catch up:</p>
                        <table class='table table-sm table-hover'>
                            <thead>
                                <tr>
                                    <th>Student Token</th>
                                    <th>Score</th>
                                    <th>Influencing Modules</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for='student in predicted_scores_bad'>
                                    <td>{{student[0]}}</td>
                                    <td style='text-align:right;'>{{student[1].toFixed(2)}}</td>
                                    <td>
                                        <span class='badge badge-light' v-for='module in student[2]' style='margin-right: 3px;'>{{module.code}}</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>`
};

Vue.component('module-enrolment-table', {
    props: ['data', 'show_extra_data', 'prereqs'], 
    template: `
        <table class='table table-hover' v-if='data.length > 0'>
            <thead class='thead-light'>
                <tr>
                    <th>Token</th>
                    <th>Faculty</th>
                    <th>Acad Plan</th>
                    <th>Acad Career</th>
                    <th>Admit Term</th>
                    <th>CAP</th>
                    <th v-if='show_extra_data'>Attendance Rate <span class='badge badge-warning'>Mocked up data</span></th>
                    <th v-if='show_extra_data'>Webcast Rate <span class='badge badge-warning'>Mocked up data</span></th>
                    <th v-if='show_extra_data && prereqs.length > 0'>Prereqs Taken <span class='badge badge-success'>Using third-party data</span></th>
                    <th>&nbsp;</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for='row in data'>
                    <td>{{row.token}}</td>
                    <td>{{row.faculty_descr}}</td>
                    <td>{{row.academic_plan_descr}}</td>
                    <td>{{row.academic_load_descr}} {{row.academic_career}}</td>
                    <td>{{row.admit_term_descr}}</td>
                    <td>{{row.CAP}}</td>
                    <td v-if='show_extra_data'>{{row.attendance}}%</td>
                    <td v-if='show_extra_data'>{{row.webcast}}%</td>
                    <td v-if='show_extra_data && prereqs.length > 0'>{{row.prereqs}}</td>
                    <td><a :href='"mailto:"+row.token+"@u.nus.edu?subject=["+$route.params.module+"] "' class='btn btn-info'><i class='fas fa-envelope'></i></a></td>
                </tr>
            </tbody>
        </table>`
})

const ModuleEnrolment = {
    props: ["show_extra_data", 'student_enrolment', 'module_prereqs'],
    template: `
    <div class='container-fluid'><transition name='fade'>
        <module-enrolment-table :data='student_enrolment' :show_extra_data='show_extra_data' :prereqs='module_prereqs'></module-enrolment-table>
    </transition></div>`
};
